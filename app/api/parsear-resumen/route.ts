import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserPlan } from '@/lib/subscription'
import { checkMonthlyLimit, commitMonthlyUsage, isOnboardingActive, usageHeaders } from '@/lib/usage-limits'
import { parseClaudeJSON, recoverPartialArray } from '@/lib/parse-claude-json'

const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024  // ~3.75 MB binario. PDFs típicos < 2 MB.
const CLAUDE_TIMEOUT_MS    = 55_000             // Vercel Hobby corta a 60s; dejamos margen

// ─── POST /api/parsear-resumen ────────────────────────────────────────────────
// Recibe un PDF de resumen de tarjeta (base64), lo procesa con Claude y
// devuelve las transacciones encontradas para que el usuario las confirme.
//
// Body: { pdf: string (base64), movimientosExistentes: { detalle, monto, fecha }[] }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Rate limit por minuto — PDFs son llamadas caras (max_tokens 16k).
  const rl = await checkRateLimit(user.id, '/api/parsear-resumen', { max: 3, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // Monthly usage gate (free tier): 1 resumen/mes. Pro: ilimitado.
  // CHECK sin incrementar — solo consumimos cupo si la operación resulta exitosa.
  // Durante el onboarding, el contador no aplica (ver isOnboardingActive).
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
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada.' },
      { status: 503 }
    )
  }

  const { pdf, movimientosExistentes = [] } = (await req.json()) as {
    pdf: string
    movimientosExistentes: { detalle: string | null; monto: number; fecha: string }[]
  }

  if (!pdf) return NextResponse.json({ error: 'No se recibió el PDF.' }, { status: 400 })
  if (pdf.length > MAX_PDF_BASE64_BYTES) {
    return NextResponse.json(
      { error: `El PDF supera el máximo de ${MAX_PDF_BASE64_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  const movsResumen = movimientosExistentes.length > 0
    ? `\nMovimientos ya cargados en el sistema (para comparar y NO duplicar):\n${
        movimientosExistentes.map(m =>
          `- ${m.fecha} | ${m.detalle ?? '(sin detalle)'} | $${m.monto}`
        ).join('\n')
      }\n`
    : ''

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
              text: `Analizá este resumen de tarjeta de crédito y extraé los siguientes items:

1. CONSUMOS del titular principal (sección "Consumos" o similar — NO los de tarjetas adicionales)
2. DESCUENTOS Y CRÉDITOS A FAVOR que aparezcan EN CUALQUIER PARTE del resumen (incluso fuera de la sección de consumos, en el encabezado o en secciones propias). Ejemplos: "CR.RG ...", "BONIF. CONSUMO ...", "REINTEGRO ...", "DESCUENTO ...", ajustes con monto negativo.
3. TODOS los items INDIVIDUALES de la sección "Impuestos, cargos e intereses" (si existe), cada uno por separado
${movsResumen}
Para cada item extraé:
- fecha (formato YYYY-MM-DD)
- detalle (descripción limpia, sin códigos internos ni número de cupón)
- monto_ars (monto en pesos como número positivo. Si es en dólares, poné null)
- monto_usd (monto en dólares como número positivo. Si es en pesos, poné null)
- cuotas (número de cuota actual si dice "C.XX/YY", sino 1)
- cuotas_total (total de cuotas si dice "C.XX/YY", sino 1)
- ya_existe (true si coincide con alguno de los movimientos ya cargados por fecha y monto similar)
- es_impuesto (true para CADA item de la sección impuestos/cargos/intereses, individualmente)
- es_descuento (true para bonificaciones, reintegros, descuentos y créditos a favor — siempre monto POSITIVO)

Para los impuestos: listá CADA LÍNEA individualmente (no las sumes). Si el PDF tiene varias páginas, asegurate de incluir todos los items de impuestos de todas las páginas. Cada item va con es_impuesto: true.
Para descuentos: incluílos individualmente con monto POSITIVO y es_descuento: true. Buscalos en TODO el documento, no solo en la sección de consumos.

Devolvé ÚNICAMENTE un JSON válido con este formato exacto, sin markdown ni texto adicional:
{
  "transacciones": [
    {
      "fecha": "2026-04-14",
      "detalle": "Netflix",
      "monto_ars": null,
      "monto_usd": 5.00,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": false,
      "es_descuento": false
    },
    {
      "fecha": "2026-04-01",
      "detalle": "CR.RG 5617 30% M",
      "monto_ars": 42434.75,
      "monto_usd": null,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": false,
      "es_descuento": true
    },
    {
      "fecha": "2026-04-14",
      "detalle": "Bonif. Consumo Openpay Los Cinco Pinos",
      "monto_ars": 12004.69,
      "monto_usd": null,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": false,
      "es_descuento": true
    },
    {
      "fecha": "2026-04-23",
      "detalle": "Impuesto de Sellos",
      "monto_ars": 19351.77,
      "monto_usd": null,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": true,
      "es_descuento": false
    },
    {
      "fecha": "2026-04-23",
      "detalle": "DB IVA 21%",
      "monto_ars": 12842.97,
      "monto_usd": null,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": true,
      "es_descuento": false
    }
  ]
}

Notas importantes:
- Ignorá SOLO los pagos realizados (sección "Pagos" del resumen)
- SÍ incluí descuentos y créditos a favor aunque estén fuera de la sección de consumos
- NO incluyas consumos de tarjetas adicionales (titular adicional)
- Para cuotas: si dice "C.04/12" significa cuota 4 de 12 — extraé SOLO esa cuota tal cual aparece
- Limpiá el detalle: "CARREFOUR MAR DEL PLATA" → "Carrefour Mar del Plata". NUNCA uses markdown (no links, no asteriscos, solo texto plano)
- Si no hay sección de impuestos/cargos, no incluyas ningún item con es_impuesto: true
- Los montos siempre van como número POSITIVO — es_descuento: true indica que es un crédito a favor
- IMPORTANTE: si el documento tiene múltiples páginas, revisá TODAS las páginas para impuestos y descuentos`,
            },
          ],
        },
      ],
    }),
  })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[parsear-resumen] Claude timeout')
      return NextResponse.json({ error: 'El PDF tardó demasiado en procesarse. Probá con un archivo más chico.' }, { status: 504 })
    }
    console.error('[parsear-resumen] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio de IA.' }, { status: 502 })
  }

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[parsear-resumen] Claude API error:', err)
    return NextResponse.json({ error: 'Error al procesar el PDF con IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText    = claudeData.content?.[0]?.text ?? ''

  // Intento de parse normal
  const parsed = parseClaudeJSON<{ transacciones?: unknown[] }>(rawText)
  if (parsed) {
    const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
    return NextResponse.json({ ok: true, transacciones: parsed.transacciones ?? [] }, { headers: committed ? usageHeaders(committed) : {} })
  }

  // Si el JSON está truncado, intentar rescatar el array de transacciones
  const recovered = recoverPartialArray(rawText, 'transacciones')
  if (recovered) {
    console.warn(`[parsear-resumen] Partial parse recovered ${recovered.length} transactions`)
    const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
    return NextResponse.json({ ok: true, transacciones: recovered }, { headers: committed ? usageHeaders(committed) : {} })
  }

  console.error('[parsear-resumen] Could not parse Claude response:', rawText.slice(0, 500))
  return NextResponse.json(
    { error: 'No se pudieron extraer los datos del resumen.' },
    { status: 422 }
  )
}
