import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { todayAR } from '@/lib/timezone'
import { checkRateLimit } from '@/lib/rate-limit'
import { getEffectivePlan } from '@/lib/subscription'
import { checkMonthlyLimit, commitMonthlyUsage, usageHeaders } from '@/lib/usage-limits'
import { MODEL_LEER_TICKET } from '@/lib/claude-models'

// ─── POST /api/leer-ticket ───────────────────────────────────────────────────
// Receives a base64 image of a receipt/ticket, sends it to Claude Vision,
// and returns structured transaction data.
//
// Body: { image: string (base64), mimeType: "image/jpeg" | "image/png" | "image/webp" }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 10/min — OCR es menos común y más caro que el chat
  const rl = await checkRateLimit(user.id, '/api/leer-ticket', { max: 10, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // Monthly usage gate (free tier): 3 tickets/mes. Pro: ilimitado.
  // CHECK sin incrementar — solo consumimos cupo si la operación resulta exitosa.
  // getEffectivePlan: el invitee Pro-via-share recibe Pro vía workspace
  // del owner. En workspace propio, su plan normal.
  const plan  = await getEffectivePlan(supabase, user)
  const usage = await checkMonthlyLimit(supabase, 'ticket', plan.has_pro_access)
  if (!usage.allowed) {
    return NextResponse.json(
      { error: 'limit_reached', feature: 'ticket', limit: usage.limit, used: usage.used },
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

  const { image, mimeType = 'image/jpeg' } = (await req.json()) as {
    image: string
    mimeType?: string
  }

  if (!image) {
    return NextResponse.json({ error: 'No se recibió imagen.' }, { status: 400 })
  }

  // ── Call Claude Vision API ─────────────────────────────────────────────────
  let claudeRes: Response
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_LEER_TICKET,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type:       'base64',
                media_type: mimeType,
                data:       image,
              },
            },
            {
              type: 'text',
              text: `Analizá este comprobante/ticket de compra y extraé los siguientes datos en formato JSON.
Si algún dato no está claro o no aparece en el ticket, usá null.

Devolvé ÚNICAMENTE el JSON, sin texto adicional, con este formato exacto:
{
  "detalle": "nombre del comercio o descripción del gasto",
  "monto": 1234.56,
  "moneda": "ARS",
  "fecha": "2026-04-18",
  "cuotas": 1
}

Notas:
- "moneda" debe ser "ARS" o "USD"
- "fecha" en formato ISO YYYY-MM-DD (si no está visible, usá hoy: ${todayAR()})
- "monto" es el total a pagar (número, sin símbolo de moneda)
- "cuotas" es la cantidad de cuotas (1 si es contado)
- "detalle" es el nombre del negocio o descripción breve`,
            },
          ],
        },
      ],
    }),
  })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[leer-ticket] Claude timeout')
      return NextResponse.json({ error: 'La imagen tardó demasiado en procesarse. Probá de nuevo.' }, { status: 504 })
    }
    console.error('[leer-ticket] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio de IA.' }, { status: 502 })
  }

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[leer-ticket] Claude API error:', err)
    return NextResponse.json({ error: 'Error al procesar la imagen con IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text ?? ''

  // ── Parse the JSON response ────────────────────────────────────────────────
  try {
    // Strip markdown code fences if present
    const clean = rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(clean)

    // Operación exitosa → commit del cupo
    const committed = await commitMonthlyUsage(supabase, 'ticket', plan.has_pro_access)
    return NextResponse.json({
      ok:      true,
      detalle: parsed.detalle  ?? null,
      monto:   parsed.monto    ?? null,
      moneda:  parsed.moneda   ?? 'ARS',
      fecha:   parsed.fecha    ?? todayAR(),
      cuotas:  parsed.cuotas   ?? 1,
    }, { headers: usageHeaders(committed) })
  } catch {
    console.error('[leer-ticket] Could not parse Claude response:', rawText)
    return NextResponse.json(
      { error: 'No se pudieron extraer los datos del ticket.', raw: rawText },
      { status: 422 }
    )
  }
}
