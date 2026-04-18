import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// ─── POST /api/asistente ─────────────────────────────────────────────────────
// Streaming chat with Claude.
// Body: { messages: [{role, content}], context: { cuentas, categorias, saldo } }

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
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

  // ── Load user context for the system prompt ──────────────────────────────
  const [{ data: cuentas }, { data: categorias }, { data: movRecientes }] =
    await Promise.all([
      adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta, moneda').eq('activa', true).eq('user_id', user.id),
      adminClient.from('categorias').select('id, nombre_categoria, tipo_default').eq('user_id', user.id).order('nombre_categoria'),
      adminClient.from('movimientos').select('fecha, detalle, monto, moneda, tipo_movimiento').eq('user_id', user.id).order('fecha', { ascending: false }).limit(20),
    ])

  const cuentasStr    = (cuentas ?? []).map(c => `- ${c.nombre_cuenta} (${c.tipo_cuenta}, ${c.moneda}) [id: ${c.id}]`).join('\n')
  const categoriasStr = (categorias ?? []).map(c => `- ${c.nombre_categoria} (${c.tipo_default}) [id: ${c.id}]`).join('\n')
  const movStr        = (movRecientes ?? []).slice(0, 10).map(m =>
    `- ${m.fecha}: ${m.detalle ?? '—'} $${m.monto} ${m.moneda} (${m.tipo_movimiento})`
  ).join('\n')

  const today = new Date().toISOString().slice(0, 10)

  const systemPrompt = `Sos Manguito, el asistente financiero personal de sinunmango — la app de finanzas de ${user.email}.
Tu personalidad: sos amigable, directo y un poco informal (tuteo siempre). Usás emojis con moderación. Sos muy bueno con los números y no te perdés en detalles innecesarios.
Hoy es ${today}.

CUENTAS DISPONIBLES:
${cuentasStr || '(sin cuentas configuradas)'}

CATEGORÍAS DISPONIBLES:
${categoriasStr || '(sin categorías)'}

ÚLTIMOS MOVIMIENTOS:
${movStr || '(sin movimientos recientes)'}

TUS CAPACIDADES:
1. Respondés preguntas sobre finanzas personales
2. Analizás los movimientos recientes y hacés observaciones útiles
3. PODÉS REGISTRAR MOVIMIENTOS directamente cuando el usuario te lo pide

PARA REGISTRAR UN MOVIMIENTO, respondé con un bloque JSON especial al FINAL de tu mensaje:
<accion>
{
  "tipo": "nuevo_movimiento",
  "detalle": "descripción del gasto",
  "monto": 4500,
  "moneda": "ARS",
  "cuotas": 1,
  "cuenta_id": "uuid-de-la-cuenta",
  "categoria_id": "uuid-de-la-categoria",
  "fecha": "${today}"
}
</accion>

REGLAS:
- Siempre intentá identificar la cuenta y categoría correctas de la lista de arriba
- Si el usuario no especifica la cuenta, usá la más probable según el contexto
- Si no podés identificar cuenta o categoría, pedí aclaración ANTES de registrar
- Contestá en español, de forma concisa y amigable
- Para análisis financieros, sé específico con números
- No inventes datos que no están en el contexto`

  // ── Stream from Claude API ────────────────────────────────────────────────
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
      stream:     true,
      messages,
    }),
  })

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[asistente] Claude API error:', err)
    return NextResponse.json({ error: 'Error del asistente de IA.' }, { status: 502 })
  }

  // Proxy the SSE stream back to the client
  const stream = new ReadableStream({
    async start(controller) {
      const reader  = claudeRes.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.enqueue(value)
        const chunk = decoder.decode(value)
        // Check for stream errors
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
