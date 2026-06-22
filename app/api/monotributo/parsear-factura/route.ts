import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseClaudeJSON } from '@/lib/parse-claude-json'
import { MODEL_PARSEAR_FACTURA } from '@/lib/claude-models'

const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024  // ~3.75 MB binario
const CLAUDE_TIMEOUT_MS    = 50_000
export const maxDuration   = 60

// ─── POST /api/monotributo/parsear-factura ───────────────────────────────────
// Recibe el PDF de una factura emitida (base64), lo procesa con Claude y
// devuelve los datos estructurados para que el usuario confirme antes de
// guardar. NO crea la factura — eso lo hace el client llamando a
// POST /api/monotributo/facturas con los datos confirmados.
//
// Si el CAE ya existe en una factura del user, marcamos `duplicado: true`
// para que el client avise (no bloqueamos acá — el insert real lo rechaza).
//
// Body: { pdf: string (base64) }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Rate limit — PDFs son llamadas caras a Claude. Límite alto (40/min)
  // para soportar el import en batch del histórico de facturas; el client
  // procesa con concurrencia baja + retry, así que rara vez lo toca.
  const rl = await checkRateLimit(user.id, '/api/monotributo/parsear-factura', { max: 40, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada.' }, { status: 503 })
  }

  const { pdf } = (await req.json()) as { pdf?: string }
  if (!pdf) return NextResponse.json({ error: 'No se recibió el PDF.' }, { status: 400 })
  if (pdf.length > MAX_PDF_BASE64_BYTES) {
    return NextResponse.json(
      { error: `El PDF supera el máximo de ${MAX_PDF_BASE64_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
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
        model:      MODEL_PARSEAR_FACTURA,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document' as const,
                source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf },
              },
              {
                type: 'text',
                text: `Analizá esta factura emitida (comprobante de AFIP/ARCA, Argentina) y extraé los datos del EMISOR hacia el CLIENTE.

OJO: el emisor es quien EMITE la factura (el monotributista). El cliente/receptor es a quien se le factura. Necesito los datos del CLIENTE y del comprobante, NO del emisor.

Extraé estos campos:
- fecha: fecha de emisión del comprobante (formato YYYY-MM-DD)
- cliente: razón social o nombre del cliente/receptor (NO el emisor). Ej: "ALBOR AGTECH S. A."
- cliente_cuit: CUIT del cliente (solo números, sin guiones). null si no figura
- monto: importe total de la factura como número (sin separador de miles, punto decimal). Ej: 2959592.61
- concepto: descripción del servicio/producto facturado (el detalle de los ítems, resumido si son varios iguales). Ej: "Servicio de Desarrollo Mayo 2026"
- tipo_comprobante: la letra del comprobante: "A", "B", "C", "E" o "M". Si dice "FACTURA C" o "COD. 011" es "C". null si no se identifica
- punto_venta: el punto de venta (formato corto, ej "00001"). null si no figura
- numero: el número del comprobante (ej "00000105"). null si no figura
- periodo_desde: inicio del período facturado (YYYY-MM-DD). null si no figura
- periodo_hasta: fin del período facturado (YYYY-MM-DD). null si no figura
- cae: el número de CAE (Código de Autorización Electrónico) de AFIP. Solo números. null si no figura
- cae_vencimiento: fecha de vencimiento del CAE (YYYY-MM-DD). null si no figura

Devolvé ÚNICAMENTE un JSON válido con este formato exacto, sin markdown ni texto adicional:
{
  "fecha": "2026-06-03",
  "cliente": "ALBOR AGTECH S. A.",
  "cliente_cuit": "30708825472",
  "monto": 2959592.61,
  "concepto": "Servicio de Desarrollo Mayo 2026",
  "tipo_comprobante": "C",
  "punto_venta": "00001",
  "numero": "00000105",
  "periodo_desde": "2026-05-01",
  "periodo_hasta": "2026-05-31",
  "cae": "86228174681542",
  "cae_vencimiento": "2026-06-13"
}

Notas:
- El monto SIEMPRE es el Importe Total (no el subtotal si difieren). En Factura C suelen coincidir.
- Si un campo no está en la factura, devolvé null (NO inventes).
- Para el concepto, si hay varias líneas con el mismo texto, devolvé ese texto una sola vez.`,
              },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[parsear-factura] Claude timeout')
      return NextResponse.json({ error: 'El PDF tardó demasiado en procesarse.' }, { status: 504 })
    }
    console.error('[parsear-factura] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio de IA.' }, { status: 502 })
  }

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[parsear-factura] Claude API error:', err)
    return NextResponse.json({ error: 'Error al procesar el PDF con IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText    = claudeData.content?.[0]?.text ?? ''

  const parsed = parseClaudeJSON<{
    fecha?:            unknown
    cliente?:          unknown
    cliente_cuit?:     unknown
    monto?:            unknown
    concepto?:         unknown
    tipo_comprobante?: unknown
    punto_venta?:      unknown
    numero?:           unknown
    periodo_desde?:    unknown
    periodo_hasta?:    unknown
    cae?:              unknown
    cae_vencimiento?:  unknown
  }>(rawText)

  if (!parsed) {
    console.error('[parsear-factura] Could not parse Claude response:', rawText.slice(0, 500))
    return NextResponse.json({ error: 'No se pudieron extraer los datos de la factura.' }, { status: 422 })
  }

  // Normalizamos: número de comprobante combinado (punto_venta-numero)
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const puntoVenta = str(parsed.punto_venta)
  const numero     = str(parsed.numero)
  const numeroComprobante = puntoVenta && numero ? `${puntoVenta}-${numero}` : (numero ?? null)
  const cae        = str(parsed.cae)

  // ── Dedup check: ¿ya existe una factura con este CAE? ──
  let duplicado = false
  if (cae) {
    const { data: existing } = await supabase
      .from('facturas_emitidas')
      .select('id')
      .eq('user_id', user.id)
      .eq('cae', cae)
      .maybeSingle()
    duplicado = !!existing
  }

  return NextResponse.json({
    ok: true,
    duplicado,
    factura: {
      fecha:              str(parsed.fecha),
      cliente:            str(parsed.cliente),
      cliente_cuit:       str(parsed.cliente_cuit),
      monto:              num(parsed.monto),
      concepto:           str(parsed.concepto),
      tipo_comprobante:   str(parsed.tipo_comprobante) ?? 'C',
      punto_venta:        puntoVenta,
      numero_comprobante: numeroComprobante,
      periodo_desde:      str(parsed.periodo_desde),
      periodo_hasta:      str(parsed.periodo_hasta),
      cae,
      cae_vencimiento:    str(parsed.cae_vencimiento),
    },
  })
}
