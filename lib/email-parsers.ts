// ─── Shared email parser library ─────────────────────────────────────────────
// Used by both /api/importar-email (manual paste) and /api/email-inbound (webhook)

export type ParsedMov = {
  fecha:       string           // ISO "2026-04-14"
  detalle:     string           // Merchant / description
  monto:       number           // Total amount (before dividing by cuotas)
  moneda:      'ARS' | 'USD'
  cuotas:      number           // 1 if not installment
  terminacion: string | null    // Last 4 digits of card
  fuente:      'infomistarjetas' | 'mercadopago' | 'desconocida'
}

// "53.592,40" → 53592.40  |  "420.690" → 420690  |  "5,00" → 5.00
export function parseMontoAR(str: string): number {
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

// "14/04/2026" → "2026-04-14"
export function fechaARtoISO(str: string): string {
  const [d, m, y] = str.split('/')
  return `${y}-${m}-${d}`
}

// ─── infomistarjetas.com (BBVA, Banco Provincia, etc.) ───────────────────────
// "registramos una autorización de consumo de $ 53.592,40 en el establecimiento
//  OPENPAY*LOS CINCO PINOS , el día 14/04/2026 a las 18:29hs con la tarjeta de
//  L BESSAN NOFAL finalizada en 1955"
// USD variant:  "de US$ 5,00 en el establecimiento ANTHROPIC"
// Con cuotas:   "de $ 99.600,00 en 18 cuotas en el establecimiento..."
export function parseInfomistarjetas(texto: string): ParsedMov | null {
  const re = /autorizaci[oó]n de consumo de\s+(US\$\s*)?([\d.,]+)(?:\s+en\s+(\d+)\s+cuotas?)?\s+en el establecimiento\s+(.+?)\s*,\s+el d[ií]a\s+(\d{2}\/\d{2}\/\d{4})[\s\S]+?finalizada en\s+(\d+)/i
  const m = texto.match(re)
  if (!m) return null

  return {
    fecha:       fechaARtoISO(m[5]),
    detalle:     m[4].trim(),
    monto:       parseMontoAR(m[2]),
    moneda:      m[1] ? 'USD' : 'ARS',
    cuotas:      m[3] ? parseInt(m[3]) : 1,
    terminacion: m[6],
    fuente:      'infomistarjetas',
  }
}

// ─── Mercado Pago ─────────────────────────────────────────────────────────────
// "Le compraste a Zentra / Pagaste $ 420.690
//  Tarjeta Mercado Pago Crédito **** 5783
//  9 cuotas de $ 46.743,33"
export function parseMercadoPago(texto: string): ParsedMov | null {
  const montoM = texto.match(/Pagaste\s+\$\s*([\d.,]+)/i)
  if (!montoM) return null

  const terminM   = texto.match(/\*{4}\s*(\d{4})/)
  const cuotasM   = texto.match(/(\d+)\s+cuotas?\s+de\s+\$\s*[\d.,]+/i)
  const comercioM = texto.match(/Le compraste a\s+(.+)/i)

  return {
    fecha:       new Date().toISOString().slice(0, 10),
    detalle:     comercioM?.[1]?.trim() ?? 'Mercado Pago',
    monto:       parseMontoAR(montoM[1]),
    moneda:      'ARS',
    cuotas:      cuotasM ? parseInt(cuotasM[1]) : 1,
    terminacion: terminM?.[1] ?? null,
    fuente:      'mercadopago',
  }
}

// ─── Auto-detect parser ───────────────────────────────────────────────────────
export function parseEmail(texto: string): ParsedMov | null {
  return parseInfomistarjetas(texto) ?? parseMercadoPago(texto)
}
