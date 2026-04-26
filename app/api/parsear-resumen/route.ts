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
              text: `Analizá este resumen de tarjeta de crédito y extraé TODOS los consumos/gastos del titular principal (no los de tarjetas adicionales, no los impuestos ni cargos administrativos).
${movsResumen}
Para cada transacción extraé:
- fecha (formato YYYY-MM-DD)
- detalle (descripción limpia del comercio, sin códigos de cupón)
- monto_ars (monto en pesos, número sin símbolo. Si es en dólares, poné null)
- monto_usd (monto en dólares, número sin símbolo. Si es en pesos, poné null)
- cuotas (número de cuota si dice "C.XX/YY" donde XX es la actual y YY el total, sino 1)
- cuotas_total (total de cuotas, sino 1)
- ya_existe (true si coincide exactamente con uno de los movimientos ya cargados por fecha y monto aproximado, false si no)

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
      "ya_existe": false
    }
  ]
}

Notas importantes:
- Ignorá pagos, ajustes, créditos y devoluciones (montos negativos)
- Ignorá impuestos, comisiones, percepciones e intereses
- Para cuotas: si dice "C.04/12" significa cuota 4 de 12 — extraé SOLO esa cuota tal cual aparece en el resumen
- Limpuá el detalle: "CARREFOUR MAR DEL PLATA" → "Carrefour Mar del Plata"`,
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
