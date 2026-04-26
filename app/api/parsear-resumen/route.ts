import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// ─── POST /api/parsear-resumen ────────────────────────────────────────────────
// Recibe un PDF de resumen de tarjeta (base64), lo procesa con Claude y
// devuelve las transacciones encontradas para que el usuario las confirme.
//
// Body: { pdf: string (base64), movimientosExistentes: { detalle, monto, fecha }[] }

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

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

  const movsResumen = movimientosExistentes.length > 0
    ? `\nMovimientos ya cargados en el sistema (para comparar y NO duplicar):\n${
        movimientosExistentes.map(m =>
          `- ${m.fecha} | ${m.detalle ?? '(sin detalle)'} | $${m.monto}`
        ).join('\n')
      }\n`
    : ''

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-6',
      max_tokens: 4096,
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
3. UN ÚNICO item agrupado con el TOTAL de la sección "Impuestos, cargos e intereses" (si existe)
${movsResumen}
Para cada item extraé:
- fecha (formato YYYY-MM-DD)
- detalle (descripción limpia, sin códigos internos ni número de cupón)
- monto_ars (monto en pesos como número positivo. Si es en dólares, poné null)
- monto_usd (monto en dólares como número positivo. Si es en pesos, poné null)
- cuotas (número de cuota actual si dice "C.XX/YY", sino 1)
- cuotas_total (total de cuotas si dice "C.XX/YY", sino 1)
- ya_existe (true si coincide con alguno de los movimientos ya cargados por fecha y monto similar)
- es_impuesto (true SOLO para el item agrupado de impuestos/cargos)
- es_descuento (true para bonificaciones, reintegros, descuentos y créditos a favor — siempre monto POSITIVO)

Para los impuestos: sumá todos los montos de esa sección en UN SOLO item con detalle "Impuestos y cargos" y la fecha del cierre del resumen.
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
      "detalle": "Impuestos y cargos",
      "monto_ars": 108504.06,
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
- Limpiá el detalle: "CARREFOUR MAR DEL PLATA" → "Carrefour Mar del Plata"
- Si no hay sección de impuestos/cargos, no incluyas ningún item con es_impuesto: true
- Los montos siempre van como número POSITIVO — es_descuento: true indica que es un crédito a favor`,
            },
          ],
        },
      ],
    }),
  })

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[parsear-resumen] Claude API error:', err)
    return NextResponse.json({ error: 'Error al procesar el PDF con IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText   = claudeData.content?.[0]?.text ?? ''

  try {
    const clean  = rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json({ ok: true, transacciones: parsed.transacciones ?? [] })
  } catch {
    console.error('[parsear-resumen] Could not parse Claude response:', rawText)
    return NextResponse.json(
      { error: 'No se pudieron extraer los datos del resumen.', raw: rawText },
      { status: 422 }
    )
  }
}
