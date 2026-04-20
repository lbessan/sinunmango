import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// ─── POST /api/asistente-mobile ───────────────────────────────────────────────
// Non-streaming version of /api/asistente for the mobile app.
// Returns a JSON response instead of an SSE stream.
//
// Body: { messages: [{role, content}] }
// Auth: Authorization: Bearer <supabase-access-token>
// Response: { text: string, accion: object | null }

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada.' },
      { status: 503 }
    )
  }

  const { messages } = (await req.json()) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  // ── Load user context ────────────────────────────────────────────────────
  const firstOfMonth = new Date(); firstOfMonth.setDate(1)
  const firstOfMonthStr = firstOfMonth.toISOString().slice(0, 10)

  const [{ data: cuentas }, { data: categorias }, { data: movRecientes }, { data: movMes }] =
    await Promise.all([
      adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta, moneda').eq('activa', true).eq('user_id', user.id),
      adminClient.from('categorias').select('id, nombre_categoria, tipo_default').eq('user_id', user.id).order('nombre_categoria'),
      adminClient.from('movimientos').select('fecha, detalle, monto, moneda, tipo_movimiento').eq('user_id', user.id).order('fecha', { ascending: false }).limit(50),
      adminClient.from('movimientos').select('monto, moneda, tipo_movimiento').eq('user_id', user.id).gte('fecha', firstOfMonthStr),
    ])

  const cuentasStr    = (cuentas ?? []).map(c => `- ${c.nombre_cuenta} (${c.tipo_cuenta}, ${c.moneda}) [id: ${c.id}]`).join('\n')
  const categoriasStr = (categorias ?? []).map(c => `- ${c.nombre_categoria} (${c.tipo_default}) [id: ${c.id}]`).join('\n')
  const movStr        = (movRecientes ?? []).map(m =>
    `- ${m.fecha}: ${m.detalle ?? '—'} $${m.monto} ${m.moneda} (${m.tipo_movimiento})`
  ).join('\n')
  const gastosMes   = (movMes ?? []).filter(m => m.tipo_movimiento === 'Gasto').reduce((s, m) => s + Number(m.monto), 0)
  const ingresosMes = (movMes ?? []).filter(m => m.tipo_movimiento === 'Ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const resumenMes  = `Gastos del mes: $${gastosMes.toLocaleString('es-AR')} ARS | Ingresos del mes: $${ingresosMes.toLocaleString('es-AR')} ARS`

  const today = new Date().toISOString().slice(0, 10)

  const systemPrompt = `Sos Manguito, el asistente financiero personal de sinunmango — la app de finanzas de ${user.email}.
Tu personalidad: sos amigable, directo y un poco informal (tuteo siempre). Usás emojis con moderación. Sos muy bueno con los números y no te perdés en detalles innecesarios.
Hoy es ${today}.

RESUMEN DEL MES ACTUAL:
${resumenMes}

CUENTAS DISPONIBLES:
${cuentasStr || '(sin cuentas configuradas)'}

CATEGORÍAS DISPONIBLES:
${categoriasStr || '(sin categorías)'}

ÚLTIMOS 50 MOVIMIENTOS:
${movStr || '(sin movimientos recientes)'}

TUS CAPACIDADES:
1. Respondés preguntas sobre finanzas personales
2. Analizás los movimientos y hacés observaciones útiles
3. PODÉS REGISTRAR MOVIMIENTOS directamente cuando el usuario te lo pide

PARA REGISTRAR UN MOVIMIENTO, respondé con un bloque JSON especial al FINAL de tu mensaje:
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
  "fecha": "${today}"
}
</accion>

REGLAS CRÍTICAS:
- El campo "monto" SIEMPRE es POSITIVO (ej: 5000, nunca -5000)
- Para gastos: "tipo_movimiento": "Gasto" — Para ingresos/sueldos/cobros: "tipo_movimiento": "Ingreso"
- El signo lo determina tipo_movimiento, NUNCA el monto
- Siempre identificá cuenta y categoría de la lista; si no podés, pedí aclaración
- Contestá en español, de forma concisa y amigable
- No inventes datos que no están en el contexto`

  // ── Call Claude (no streaming) ────────────────────────────────────────────
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      stream:     false,
      messages,
    }),
  })

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[asistente-mobile] Claude API error:', err)
    return NextResponse.json({ error: 'Error del asistente de IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const fullText   = claudeData.content?.[0]?.text ?? ''

  // ── Extract <accion> block if present ────────────────────────────────────
  const accionMatch = fullText.match(/<accion>([\s\S]*?)<\/accion>/)
  let accion: Record<string, unknown> | null = null
  let text = fullText

  if (accionMatch) {
    try {
      accion = JSON.parse(accionMatch[1].trim())
      text   = fullText.replace(/<accion>[\s\S]*?<\/accion>/, '').trim()
    } catch { /* keep text as-is */ }
  }

  return NextResponse.json({ text, accion })
}
