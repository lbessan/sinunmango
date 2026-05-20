import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserPlan } from '@/lib/subscription'
import { checkMonthlyLimit, commitMonthlyUsage, isOnboardingActive, usageHeaders } from '@/lib/usage-limits'
import { parseClaudeJSON, recoverPartialArray, recoverObject } from '@/lib/parse-claude-json'

const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024  // ~3.75 MB binario
const CLAUDE_TIMEOUT_MS    = 55_000

// ─── POST /api/parsear-tarjeta-pdf ────────────────────────────────────────────
// Recibe un PDF de resumen de tarjeta (base64), extrae metadata de la tarjeta
// (banco, red, variante, terminacion, dias de cierre/vencimiento) y los consumos.
// Usado durante el onboarding para configurar tarjetas con histórico.
//
// Body: { pdf: string (base64) }
// Response: { ok: true, tarjeta: {...}, transacciones: [...] }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Rate limit por minuto — mismo costo Anthropic que parsear-resumen.
  const rl = await checkRateLimit(user.id, '/api/parsear-tarjeta-pdf', { max: 3, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // Monthly usage gate: comparte el cupo con /api/parsear-resumen (mismo costo IA).
  // Free: 1 PDF/mes. Pro: ilimitado.
  // Durante el onboarding (onboarding_completed_at IS NULL en user_profiles)
  // el contador no aplica — el user todavía está armando su cuenta y queremos
  // dejarlo probar la importación sin gastar el 1/1 antes de empezar a usar
  // la app. Cuando termina el wizard, el contador empieza a correr normal.
  const plan         = await getUserPlan(supabase)
  const inOnboarding = await isOnboardingActive(supabase, user.id)
  const usage        = inOnboarding
    ? null
    : await checkMonthlyLimit(supabase, 'resumen', plan.has_pro_access)
  if (usage && !usage.allowed) {
    return NextResponse.json(
      { error: 'limit_reached', feature: 'resumen', limit: usage.limit, used: usage.used },
      { status: 429 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada.' }, { status: 503 })
  }

  const { pdf } = (await req.json()) as { pdf: string }
  if (!pdf) return NextResponse.json({ error: 'No se recibió el PDF.' }, { status: 400 })
  if (pdf.length > MAX_PDF_BASE64_BYTES) {
    return NextResponse.json(
      { error: `El PDF supera el máximo de ${MAX_PDF_BASE64_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  let claudeRes: Response
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'document',
              source: {
                type:       'base64',
                media_type: 'application/pdf',
                data:       pdf,
              },
            },
            {
              type: 'text',
              text: `Analizá este resumen de tarjeta de crédito y extraé dos cosas:

1. INFORMACIÓN DE LA TARJETA:
- banco: nombre del banco emisor (ej: "Galicia", "Santander", "BBVA", "Macro", "Supervielle", "Naranja X", "Brubank", "HSBC", "Nación", "Provincia", etc.)
- red: red de la tarjeta — SOLO uno de estos valores exactos: visa, mastercard, amex, naranja, cabal, maestro
- variante: variante de la tarjeta — SOLO uno de estos valores exactos: standard, gold, platinum, signature, black, infinite. Si no podés determinarlo con certeza, usá "standard"
- terminacion: últimos 4 dígitos del número de tarjeta (si figuran en el resumen, sino "")
- dia_cierre: día del mes de cierre del período (número entero entre 1 y 31, null si no figura)
- dia_vencimiento: día del mes en que vence el pago (número entero entre 1 y 31, null si no figura)
- nombre_sugerido: nombre descriptivo de la tarjeta (ej: "Galicia Visa Signature", "Santander Mastercard Gold")

2. CONSUMOS DEL TITULAR PRINCIPAL:
Extraé: consumos del titular (NO adicionales), descuentos/bonificaciones/reintegros/créditos (es_descuento: true), e impuestos/cargos individualmente (es_impuesto: true).
Ignorá los pagos realizados.

Para cada consumo:
- fecha (YYYY-MM-DD)
- detalle (texto limpio, sin markdown, sin links, sin asteriscos, sin cupones)
- monto_ars (número positivo si es en ARS, null si es en USD)
- monto_usd (número positivo si es en USD, null si es en ARS)
- cuotas (número de cuota actual, 1 si no aplica)
- cuotas_total (total de cuotas, 1 si no aplica)
- es_impuesto (true para items de la sección impuestos/cargos/intereses)
- es_descuento (true para bonificaciones, reintegros, créditos a favor — monto siempre POSITIVO)

Devolvé ÚNICAMENTE un JSON válido sin markdown ni texto adicional:
{
  "tarjeta": {
    "banco": "Galicia",
    "red": "visa",
    "variante": "signature",
    "terminacion": "1234",
    "dia_cierre": 14,
    "dia_vencimiento": 4,
    "nombre_sugerido": "Galicia Visa Signature"
  },
  "transacciones": [
    {
      "fecha": "2026-04-14",
      "detalle": "Netflix",
      "monto_ars": null,
      "monto_usd": 5.00,
      "cuotas": 1,
      "cuotas_total": 1,
      "es_impuesto": false,
      "es_descuento": false
    }
  ]
}

Notas importantes:
- NUNCA uses markdown en los detalles (sin links, sin asteriscos, solo texto plano)
- Si el documento tiene múltiples páginas, revisá TODAS las páginas
- Los montos van siempre POSITIVOS — es_descuento: true indica crédito a favor
- Para cuotas: "C.04/12" → cuotas: 4, cuotas_total: 12`,
            },
          ],
        },
      ],
    }),
  })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[parsear-tarjeta-pdf] Claude timeout')
      return NextResponse.json({ error: 'El PDF tardó demasiado en procesarse. Probá con un archivo más chico.' }, { status: 504 })
    }
    console.error('[parsear-tarjeta-pdf] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio de IA.' }, { status: 502 })
  }

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[parsear-tarjeta-pdf] Claude API error:', err)
    return NextResponse.json({ error: 'Error al procesar el PDF con IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText    = claudeData.content?.[0]?.text ?? ''

  // Intento de parse normal
  const parsed = parseClaudeJSON<{ tarjeta?: unknown; transacciones?: unknown[] }>(rawText)
  if (parsed) {
    const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
    return NextResponse.json({
      ok:            true,
      tarjeta:       parsed.tarjeta ?? {},
      transacciones: parsed.transacciones ?? [],
    }, { headers: committed ? usageHeaders(committed) : {} })
  }

  // Truncado: rescatar transacciones parciales + bloque de tarjeta por separado
  const recovered = recoverPartialArray(rawText, 'transacciones')
  if (recovered) {
    const tarjeta = recoverObject(rawText, 'tarjeta') ?? {}
    console.warn(`[parsear-tarjeta-pdf] Partial parse recovered ${recovered.length} transactions`)
    const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
    return NextResponse.json({ ok: true, tarjeta, transacciones: recovered }, { headers: committed ? usageHeaders(committed) : {} })
  }

  console.error('[parsear-tarjeta-pdf] Could not parse Claude response:', rawText.slice(0, 500))
  return NextResponse.json(
    { error: 'No se pudieron extraer los datos del resumen.' },
    { status: 422 }
  )
}
