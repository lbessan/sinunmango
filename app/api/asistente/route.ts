import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// ─── POST /api/asistente ─────────────────────────────────────────────────────
// Streaming chat with Claude.
// Body: { messages: [{role, content}] }

export const runtime = 'nodejs'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // ── Rangos de fechas ─────────────────────────────────────────────────────
  const today       = new Date()
  const todayStr    = today.toISOString().slice(0, 10)
  const hace6Meses  = new Date(today.getFullYear(), today.getMonth() - 5, 1)
  const hace6Str    = hace6Meses.toISOString().slice(0, 10)

  // ── Carga paralela de todo el contexto ───────────────────────────────────
  const [
    { data: cuentasSaldos },
    { data: resumen },
    { data: categorias },
    { data: gastosFijos },
    { data: params },
    { data: movHistorico },
    { data: movRecientes },
  ] = await Promise.all([
    // Saldos actuales por cuenta (view)
    adminClient
      .from('saldo_actual_cuentas')
      .select('id, nombre_cuenta, tipo_cuenta, moneda, saldo_actual')
      .eq('activa', true)
      .eq('user_id', user.id),

    // Dashboard resumen: disponible, deuda tarjetas, proyectado, etc.
    adminClient
      .from('dashboard_resumen')
      .select('*')
      .eq('user_id', user.id)
      .single(),

    // Categorías con id (para registrar movimientos)
    adminClient
      .from('categorias')
      .select('id, nombre_categoria, tipo_default')
      .eq('user_id', user.id)
      .order('nombre_categoria'),

    // Gastos fijos activos
    adminClient
      .from('gastos_fijos')
      .select('nombre_gasto, monto_estimado, moneda, dia_vencimiento, cuentas(nombre_cuenta, tipo_cuenta)')
      .eq('activo', true)
      .eq('user_id', user.id)
      .order('dia_vencimiento'),

    // Cotización dólar
    adminClient
      .from('parametros')
      .select('valor')
      .eq('id', 'Dolar_Tarjeta_BNA')
      .eq('user_id', user.id)
      .single(),

    // Movimientos de los últimos 6 meses (para resúmenes mensuales)
    adminClient
      .from('movimientos')
      .select('fecha, monto, moneda, tipo_movimiento, categorias(nombre_categoria)')
      .eq('user_id', user.id)
      .gte('fecha', hace6Str)
      .order('fecha', { ascending: false }),

    // Últimos 80 movimientos con detalle (para contexto reciente)
    adminClient
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
      const cat = (m.categorias as any)?.nombre_categoria ?? 'Sin categoría'
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
    const esTarjeta = (g.cuentas as any)?.tipo_cuenta === 'Tarjeta Credito'
    const monto     = g.moneda === 'USD' ? `US$${g.monto_estimado} (~$${fmt(Math.round((g.monto_estimado ?? 0) * dolar))})` : `$${fmt(g.monto_estimado ?? 0)}`
    return `  - ${g.nombre_gasto}: ${monto} · día ${g.dia_vencimiento ?? '—'} · ${(g.cuentas as any)?.nombre_cuenta ?? '—'}${esTarjeta ? ' (tarjeta)' : ''}`
  }).join('\n')
  const totalGF_ef = (gastosFijos ?? [])
    .filter(g => (g.cuentas as any)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((s, g) => s + (g.moneda === 'USD' ? (g.monto_estimado ?? 0) * dolar : (g.monto_estimado ?? 0)), 0)
  const totalGF_tc = (gastosFijos ?? [])
    .filter(g => (g.cuentas as any)?.tipo_cuenta === 'Tarjeta Credito')
    .reduce((s, g) => s + (g.moneda === 'USD' ? (g.monto_estimado ?? 0) * dolar : (g.monto_estimado ?? 0)), 0)

  // ── Movimientos recientes ─────────────────────────────────────────────────
  const movStr = (movRecientes ?? []).map(m => {
    const cat = (m.categorias as any)?.nombre_categoria ?? ''
    const cta = (m.cuentas as any)?.nombre_cuenta ?? ''
    return `  ${m.fecha} | ${m.tipo_movimiento.padEnd(8)} | $${String(m.monto).padStart(10)} ${m.moneda} | ${m.detalle ?? '—'}${cat ? ' [' + cat + ']' : ''}${cta ? ' (' + cta + ')' : ''}`
  }).join('\n')

  // ── Categorías (para registrar movimientos) ───────────────────────────────
  const categoriasStr = (categorias ?? []).map(c => `  - ${c.nombre_categoria} (${c.tipo_default}) [id: ${c.id}]`).join('\n')

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
CATEGORÍAS DISPONIBLES (para registrar)
═══════════════════════════════════════
${categoriasStr || '  (sin categorías)'}

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
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      stream:     true,
      messages,
    }),
  })

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[asistente] Claude API error:', err)
    return NextResponse.json({ error: 'Error del asistente de IA.' }, { status: 502 })
  }

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
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
