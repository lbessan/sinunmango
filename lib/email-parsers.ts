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
// Nota: (?:(US\$)|\$)?\s* captura "US$" en grupo 1 (→ USD), o "$" sin captura (→ ARS)
const INFOMIS_RE = () =>
  /autorizaci[oó]n de consumo de\s+(?:(US\$)|\$)?\s*([\d.,]+)(?:\s+en\s+(\d+)\s+cuotas?)?\s+en el establecimiento\s+(.+?)\s*,\s+el d[ií]a\s+(\d{2}\/\d{2}\/\d{4})[\s\S]+?finalizada en\s+(\d+)/gi

function infomisMatch(m: RegExpExecArray): ParsedMov {
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

export function parseInfomistarjetas(texto: string): ParsedMov | null {
  const re = INFOMIS_RE()
  const m = re.exec(texto)
  return m ? infomisMatch(m) : null
}

// Digest emails ("Novedades de tus transacciones") may contain multiple transactions
export function parseAllInfomistarjetas(texto: string): ParsedMov[] {
  const re = INFOMIS_RE()
  const results: ParsedMov[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    results.push(infomisMatch(m))
  }
  return results
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

// ─── Mercado Pago — Transferencia enviada ────────────────────────────────────
// "Tu transferencia fue enviada" — envíos de dinero entre cuentas MP
// Formato típico: "Enviaste $X,XX a [Nombre]" o "Transferiste $X,XX a [Nombre]"
export function parseMercadoPagoTransferencia(texto: string): ParsedMov | null {
  // Detectar el monto — "Enviaste $X,XX" o "Transferiste $X,XX"
  const montoM = texto.match(/(?:Enviaste|Transferiste)\s+\$\s*([\d.,]+)/i)
  if (!montoM) return null

  // Destinatario — "a [Nombre]" después del monto
  const destinoM = texto.match(/(?:Enviaste|Transferiste)\s+\$\s*[\d.,]+\s+a\s+(.+)/i)

  // Fecha — "el DD/MM/YYYY" o extraer de la fecha del mail (fallback: hoy)
  const fechaM = texto.match(/(\d{2}\/\d{2}\/\d{4})/)

  return {
    fecha:       fechaM ? fechaARtoISO(fechaM[1]) : new Date().toISOString().slice(0, 10),
    detalle:     destinoM ? `MP → ${destinoM[1].trim()}` : 'Transferencia Mercado Pago',
    monto:       parseMontoAR(montoM[1]),
    moneda:      'ARS',
    cuotas:      1,
    terminacion: null,   // transferencias no tienen terminación de tarjeta
    fuente:      'mercadopago',
  }
}

// ─── Auto-detect parser (single) ─────────────────────────────────────────────
export function parseEmail(texto: string): ParsedMov | null {
  return parseInfomistarjetas(texto)
    ?? parseMercadoPago(texto)
    ?? parseMercadoPagoTransferencia(texto)
}

// ─── Auto-detect parser (all matches) ────────────────────────────────────────
// Handles digest emails with multiple transactions (e.g. "Novedades de tus transacciones")
export function parseAllEmails(texto: string): ParsedMov[] {
  // Try infomistarjetas multi-match first (digest format)
  const infomis = parseAllInfomistarjetas(texto)
  if (infomis.length > 0) return infomis

  // For other parsers (single-transaction), wrap result in array
  const single = parseMercadoPago(texto) ?? parseMercadoPagoTransferencia(texto)
  return single ? [single] : []
}
