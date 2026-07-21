// ─── lib/monotributo-escala.ts ───────────────────────────────────────────────
//
// Escala de categorías del monotributo (A–K) leída de la página PÚBLICA de AFIP
// (sin login ni certificado). AFIP la actualiza ~2x/año; un cron la re-lee y
// mantiene los topes/cuotas al día solos.
//
// Fuente: https://www.afip.gob.ar/monotributo/categorias.asp
// La tabla usa atributos `headers="th_{CAT}_t15 th_{campo}_t15"` en cada celda,
// así que el parseo es determinístico (no depende del orden visual).

export type EscalaRow = {
  categoria: string          // 'A'..'K'
  limite_anual: number       // ingresos brutos anuales (tope)
  cuota_servicios: number    // total mensual — locaciones y prestaciones de servicios
  cuota_bienes: number       // total mensual — venta de cosas muebles
}

const FUENTE = 'https://www.afip.gob.ar/monotributo/categorias.asp'
const CATEGORIAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

/** "$12.009.410,45 " → 12009410.45 (punto = miles, coma = decimal). */
export function parseMonto(s: string | null | undefined): number | null {
  if (!s) return null
  const clean = s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : null
}

/** Valor de la celda <td> cuya lista `headers` incluye th_{cat}_t15 y {fieldId}. */
function celda(html: string, cat: string, fieldId: string): string | null {
  // Los ids (th_A_t15, th_ing_br_t15, …) son únicos, así que el substring
  // dentro del mismo atributo `headers` (acotado por comillas) es suficiente.
  const re = new RegExp(
    `<td[^>]*headers="[^"]*th_${cat}_t15[^"]*${fieldId}[^"]*"[^>]*>([^<]*)</td>`,
    'i',
  )
  const m = html.match(re)
  return m ? m[1].trim() : null
}

/** Parsea la escala completa desde el HTML de la página de AFIP. */
export function parseEscala(html: string): EscalaRow[] {
  const rows: EscalaRow[] = []
  for (const cat of CATEGORIAS) {
    const limite = parseMonto(celda(html, cat, 'th_ing_br_t15'))
    if (limite == null) continue // categoría no presente / cambió el formato
    rows.push({
      categoria: cat,
      limite_anual: limite,
      cuota_servicios: parseMonto(celda(html, cat, 'th_total_loc_t15')) ?? 0,
      cuota_bienes: parseMonto(celda(html, cat, 'th_total_ven_t15')) ?? 0,
    })
  }
  return rows
}

/** "...aplicación desde el 1/08/2026" → "2026-08-01" (ISO) o null. */
export function parseVigenciaISO(html: string): string | null {
  const m = html.match(/aplicaci[oó]n\s+desde\s+el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Baja la página de AFIP y devuelve la escala + vigencia. Tira si algo falla. */
export async function fetchEscala(): Promise<{ escala: EscalaRow[]; vigencia: string | null }> {
  const res = await fetch(FUENTE, { headers: { 'User-Agent': 'Mozilla/5.0 (sinunmango)' } })
  if (!res.ok) throw new Error(`AFIP respondió ${res.status}`)
  const html = await res.text()
  const escala = parseEscala(html)
  if (escala.length < 8) {
    throw new Error(`Escala incompleta (${escala.length} categorías) — puede haber cambiado el formato de AFIP`)
  }
  return { escala, vigencia: parseVigenciaISO(html) }
}
