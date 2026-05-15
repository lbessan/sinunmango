import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { todayAR, todayPartsAR } from '@/lib/timezone'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserPlan } from '@/lib/subscription'
import { checkMonthlyLimit, commitMonthlyUsage, usageHeaders } from '@/lib/usage-limits'

// ─── POST /api/asistente ─────────────────────────────────────────────────────
// Streaming chat with Claude.
// Body: { messages: [{role, content}] }

export const runtime = 'nodejs'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 20 requests por minuto. Protege contra loops accidentales que
  // facturan en la API de Claude.
  const rl = await checkRateLimit(user.id, '/api/asistente', { max: 20, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // Monthly usage gate (free tier): 5 mensajes/mes. Pro: ilimitado.
  // CHECK sin incrementar — solo consumimos cupo si la operación resulta exitosa.
  const plan  = await getUserPlan(supabase)
  const usage = await checkMonthlyLimit(supabase, 'asistente', plan.has_pro_access)
  if (!usage.allowed) {
    return NextResponse.json(
      { error: 'limit_reached', feature: 'asistente', limit: usage.limit, used: usage.used },
      { status: 429 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada. Agregala en las variables de entorno de Vercel.' },
      { status: 503 }
    )
  }

  const { messages } = (await req.json()) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  // ── Rangos de fechas (zona horaria AR) ──────────────────────────────────
  const { year: yAR, month: mAR, day: dAR } = todayPartsAR()
  const today       = new Date(yAR, mAR - 1, dAR)
  const todayStr    = todayAR()
  const hace6Meses  = new Date(yAR, mAR - 1 - 5, 1)
  const hace6Str    = `${hace6Meses.getFullYear()}-${String(hace6Meses.getMonth() + 1).padStart(2, '0')}-01`

  // ── Carga paralela de todo el contexto ───────────────────────────────────
  const [
    { data: cuentasSaldos },
    { data: resumen },
    { data: categorias },
    { data: subcategorias },
    { data: gastosFijos },
    { data: inversiones },
    { data: params },
    { data: movHistorico },
    { data: movRecientes },
  ] = await Promise.all([
    // Saldos actuales por cuenta (view) — RLS filtra al user
    supabase
      .from('saldo_actual_cuentas')
      .select('id, nombre_cuenta, tipo_cuenta, moneda, saldo_actual')
      .eq('activa', true)
      .eq('user_id', user.id),

    // Dashboard resumen: disponible, deuda tarjetas, proyectado, etc.
    supabase
      .from('dashboard_resumen')
      .select('*')
      .eq('user_id', user.id)
      .single(),

    // Categorías con id (para registrar movimientos)
    supabase
      .from('categorias')
      .select('id, nombre_categoria, tipo_default')
      .eq('user_id', user.id)
      .order('nombre_categoria'),

    // Subcategorías (útiles para categorización fina al registrar)
    supabase
      .from('subcategorias')
      .select('id, nombre_subcategoria, categoria_padre')
      .eq('user_id', user.id)
      .order('nombre_subcategoria'),

    // Gastos fijos activos
    supabase
      .from('gastos_fijos')
      .select('nombre_gasto, monto_estimado, moneda, dia_vencimiento, cuentas(nombre_cuenta, tipo_cuenta)')
      .eq('activo', true)
      .eq('user_id', user.id)
      .order('dia_vencimiento'),

    // Inversiones (plazos fijos, FCI, dólares, crypto, bonos, etc.)
    supabase
      .from('inversiones')
      .select('tipo, nombre, fecha_inicio, fecha_vencimiento, moneda, capital_inicial, valor_actual, estado, datos, notas')
      .eq('user_id', user.id)
      .neq('estado', 'cancelado')
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false }),

    // Cotización dólar
    supabase
      .from('parametros')
      .select('valor')
      .eq('id', 'Dolar_Tarjeta_BNA')
      .eq('user_id', user.id)
      .single(),

    // Movimientos de los últimos 6 meses (para resúmenes mensuales)
    supabase
      .from('movimientos')
      .select('fecha, monto, moneda, tipo_movimiento, categorias(nombre_categoria)')
      .eq('user_id', user.id)
      .gte('fecha', hace6Str)
      .order('fecha', { ascending: false }),

    // Últimos 80 movimientos con detalle (para contexto reciente)
    supabase
      .from('movimientos')
      .select('fecha, detalle, monto, moneda, tipo_movimiento, categorias(nombre_categoria), cuentas(nombre_cuenta)')
      .eq('user_id', user.id)
      .order('fecha', { ascending: false })
      .limit(80),
  ])

  // ── Procesar resúmenes mensuales ─────────────────────────────────────────
  type MesResumen = {
    gastos: number; ingresos: number
    topCats: Record<string, number>
  }
  const porMes: Record<string, MesResumen> = {}
  for (const m of (movHistorico ?? [])) {
    const mes = m.fecha.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = { gastos: 0, ingresos: 0, topCats: {} }
    const monto = Number(m.monto)
    if (m.tipo_movimiento === 'Gasto') {
      porMes[mes].gastos += monto
      const cat = (m.categorias as { nombre_categoria?: string } | null)?.nombre_categoria ?? 'Sin categoría'
      porMes[mes].topCats[cat] = (porMes[mes].topCats[cat] ?? 0) + monto
    } else if (m.tipo_movimiento === 'Ingreso') {
      porMes[mes].ingresos += monto
    }
  }

  const mesesOrdenados = Object.keys(porMes).sort().reverse()
  const resumenMensualStr = mesesOrdenados.map(mes => {
    const r = porMes[mes]
    const ahorro = r.ingresos - r.gastos
    const topCats = Object.entries(r.topCats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cat, total]) => `    · ${cat}: $${fmt(Math.round(total))}`)
      .join('\n')
    return `  ${mes}:
    Ingresos: $${fmt(Math.round(r.ingresos))} | Gastos: $${fmt(Math.round(r.gastos))} | Ahorro: ${ahorro >= 0 ? '+' : ''}$${fmt(Math.round(ahorro))}
${topCats}`
  }).join('\n')

  // ── Saldos por cuenta ────────────────────────────────────────────────────
  const cuentasStr = (cuentasSaldos ?? []).map(c => {
    const simbolo = c.moneda === 'USD' ? 'US$' : '$'
    return `  - ${c.nombre_cuenta} (${c.tipo_cuenta}): ${simbolo}${fmt(c.saldo_actual ?? 0)} [id: ${c.id}]`
  }).join('\n')

  // ── Gastos fijos ─────────────────────────────────────────────────────────
  const dolar = params?.valor ?? 1410
  const gastosFijosStr = (gastosFijos ?? []).map(g => {
    const cuentaJoin = g.cuentas as { tipo_cuenta?: string; nombre_cuenta?: string } | null
    const esTarjeta  = cuentaJoin?.tipo_cuenta === 'Tarjeta Credito'
    const monto      = g.moneda === 'USD' ? `US$${g.monto_estimado} (~$${fmt(Math.round((g.monto_estimado ?? 0) * dolar))})` : `$${fmt(g.monto_estimado ?? 0)}`
    return `  - ${g.nombre_gasto}: ${monto} · día ${g.dia_vencimiento ?? '—'} · ${cuentaJoin?.nombre_cuenta ?? '—'}${esTarjeta ? ' (tarjeta)' : ''}`
  }).join('\n')
  const totalGF_ef = (gastosFijos ?? [])
    .filter(g => (g.cuentas as { tipo_cuenta?: string } | null)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((s, g) => s + (g.moneda === 'USD' ? (g.monto_estimado ?? 0) * dolar : (g.monto_estimado ?? 0)), 0)
  const totalGF_tc = (gastosFijos ?? [])
    .filter(g => (g.cuentas as { tipo_cuenta?: string } | null)?.tipo_cuenta === 'Tarjeta Credito')
    .reduce((s, g) => s + (g.moneda === 'USD' ? (g.monto_estimado ?? 0) * dolar : (g.monto_estimado ?? 0)), 0)

  // ── Movimientos recientes ─────────────────────────────────────────────────
  const movStr = (movRecientes ?? []).map(m => {
    const cat = (m.categorias as { nombre_categoria?: string } | null)?.nombre_categoria ?? ''
    const cta = (m.cuentas    as { nombre_cuenta?: string }    | null)?.nombre_cuenta    ?? ''
    return `  ${m.fecha} | ${m.tipo_movimiento.padEnd(8)} | $${String(m.monto).padStart(10)} ${m.moneda} | ${m.detalle ?? '—'}${cat ? ' [' + cat + ']' : ''}${cta ? ' (' + cta + ')' : ''}`
  }).join('\n')

  // ── Categorías (para registrar movimientos) ───────────────────────────────
  const categoriasStr = (categorias ?? []).map(c => `  - ${c.nombre_categoria} (${c.tipo_default}) [id: ${c.id}]`).join('\n')

  // ── Subcategorías ────────────────────────────────────────────────────────
  const catNameById: Record<string, string> = Object.fromEntries(
    (categorias ?? []).map(c => [c.id, c.nombre_categoria ?? ''])
  )
  const subcategoriasStr = (subcategorias ?? []).map(sc => {
    const padre = sc.categoria_padre ? (catNameById[sc.categoria_padre] ?? '?') : '—'
    return `  - ${sc.nombre_subcategoria} (de ${padre}) [id: ${sc.id}]`
  }).join('\n')

  // ── Inversiones (plazos fijos, FCI, etc.) ────────────────────────────────
  const TIPO_INV_LABEL: Record<string, string> = {
    plazo_fijo: 'Plazo Fijo', plazo_fijo_uva: 'Plazo Fijo UVA', fci: 'FCI',
    dolar: 'Dólar físico', crypto: 'Crypto', cedear: 'CEDEAR', accion: 'Acción',
    bono: 'Bono', on: 'ON corporativa', otro: 'Otro',
  }
  const inversionesStr = (inversiones ?? []).map(inv => {
    const tipo    = TIPO_INV_LABEL[inv.tipo ?? ''] ?? inv.tipo ?? '?'
    const simbolo = inv.moneda === 'USD' ? 'US$' : '$'
    const nombre  = inv.nombre ? ` "${inv.nombre}"` : ''
    const vence   = inv.fecha_vencimiento
      ? (() => {
          const dias = Math.round((new Date(inv.fecha_vencimiento + 'T12:00:00').getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          const txt  = dias < 0 ? `vencido hace ${-dias}d` : dias === 0 ? 'vence HOY' : `vence en ${dias}d (${inv.fecha_vencimiento})`
          return ` · ${txt}`
        })()
      : ''
    const capital = `${simbolo}${fmt(inv.capital_inicial ?? 0)}`
    const valor   = inv.valor_actual != null ? ` · valor actual ${simbolo}${fmt(inv.valor_actual)}` : ''
    const datos   = inv.datos && Object.keys(inv.datos as object).length > 0 ? ` · ${JSON.stringify(inv.datos)}` : ''
    const notas   = inv.notas ? ` · "${inv.notas}"` : ''
    return `  - ${tipo}${nombre}: capital ${capital}${valor} · inicio ${inv.fecha_inicio}${vence} · estado ${inv.estado}${datos}${notas}`
  }).join('\n')

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = `Sos Manguito, el asistente financiero personal de sinunmango — la app de finanzas de ${user.email}.
Personalidad: amigable, directo, informal (tuteo siempre). Emojis con moderación. Preciso con los números. No inventás datos.
Hoy es ${todayStr} (${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}).
Cotización dólar BNA tarjeta: $${fmt(dolar)} ARS.

═══════════════════════════════════════
ESTADO FINANCIERO ACTUAL
═══════════════════════════════════════

SALDO DISPONIBLE TOTAL: $${fmt(resumen?.disponible_real ?? 0)} ARS
(suma de billeteras, bancos y efectivo — sin tarjetas de crédito)

SALDOS POR CUENTA:
${cuentasStr || '  (sin cuentas)'}

DEUDA TARJETAS PERÍODO ACTUAL: $${fmt(resumen?.deuda_tarjetas_periodo ?? 0)} ARS
PAGOS DE TARJETAS REALIZADOS: $${fmt(resumen?.pagos_tarjeta_mes ?? 0)} ARS
INGRESOS FUTUROS CARGADOS (este mes): $${fmt(resumen?.ingresos_futuros_mes ?? 0)} ARS

═══════════════════════════════════════
RESÚMENES MENSUALES (últimos 6 meses)
═══════════════════════════════════════
${resumenMensualStr || '  (sin datos)'}

═══════════════════════════════════════
GASTOS FIJOS ACTIVOS
═══════════════════════════════════════
${gastosFijosStr || '  (sin gastos fijos)'}
  → Total efectivo/banco: $${fmt(Math.round(totalGF_ef))} ARS/mes
  → Total tarjetas (recurrente): $${fmt(Math.round(totalGF_tc))} ARS/mes

═══════════════════════════════════════
ÚLTIMOS 80 MOVIMIENTOS
═══════════════════════════════════════
${movStr || '  (sin movimientos)'}

═══════════════════════════════════════
INVERSIONES ACTIVAS (plazos fijos, FCI, dólar, crypto, bonos, etc.)
═══════════════════════════════════════
${inversionesStr || '  (sin inversiones cargadas)'}

═══════════════════════════════════════
CATEGORÍAS DISPONIBLES (para registrar)
═══════════════════════════════════════
${categoriasStr || '  (sin categorías)'}

═══════════════════════════════════════
SUBCATEGORÍAS DISPONIBLES (opcional al registrar)
═══════════════════════════════════════
${subcategoriasStr || '  (sin subcategorías)'}

═══════════════════════════════════════
TUS CAPACIDADES
═══════════════════════════════════════
1. Respondés preguntas sobre los datos de arriba (saldos, gastos, tendencias, comparaciones entre meses)
2. Analizás patrones y hacés observaciones útiles
3. PODÉS REGISTRAR MOVIMIENTOS directamente cuando el usuario te lo pide

PARA REGISTRAR UN MOVIMIENTO, incluí este bloque JSON al FINAL de tu respuesta:
<accion>
{
  "tipo": "nuevo_movimiento",
  "detalle": "descripción",
  "monto": 4500,
  "moneda": "ARS",
  "tipo_movimiento": "Gasto",
  "cuotas": 1,
  "cuenta_id": "uuid-de-la-cuenta",
  "categoria_id": "uuid-de-la-categoria",
  "fecha": "${todayStr}"
}
</accion>

REGLAS CRÍTICAS:
- "monto" SIEMPRE POSITIVO — el signo lo determina tipo_movimiento, nunca el monto
- Nunca inventes datos. Si no está en el contexto, decilo claramente
- Si el usuario pregunta por "el mes pasado", buscá el mes anterior en los resúmenes mensuales
- Para análisis, usá los números exactos del contexto
- Contestá en español, de forma concisa y amigable`

  // ── Stream desde Claude API ───────────────────────────────────────────────
  let claudeRes: Response
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(55_000),
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      // System prompt con prompt caching: el contexto financiero (saldos, movs,
      // categorías) cambia poco entre mensajes consecutivos de una conversación,
      // así que lo marcamos cacheable. TTL default de 5min cubre la mayoría de
      // las charlas. Cache hit reduce el costo de esos tokens a 0.1x.
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      stream:   true,
      messages,
    }),
  })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[asistente] Claude timeout')
      return NextResponse.json({ error: 'El asistente está tardando demasiado. Probá de nuevo.' }, { status: 504 })
    }
    console.error('[asistente] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al asistente.' }, { status: 502 })
  }

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[asistente] Claude API error:', err)
    return NextResponse.json({ error: 'Error del asistente de IA.' }, { status: 502 })
  }

  // Operación exitosa (Claude respondió 200) → commit del cupo.
  // El stream puede romperse después, pero el costo de Claude ya se incurrió,
  // así que consumimos cupo acá.
  const committed = await commitMonthlyUsage(supabase, 'asistente', plan.has_pro_access)

  // Proxy del SSE stream al cliente
  const stream = new ReadableStream({
    async start(controller) {
      const reader  = claudeRes.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.enqueue(value)
        const chunk = decoder.decode(value)
        if (chunk.includes('"type":"error"')) {
          console.error('[asistente] Stream error:', chunk)
        }
      }
      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      ...usageHeaders(committed),
    },
  })
}
