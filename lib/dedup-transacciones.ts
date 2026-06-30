// ─── Dedup de transacciones parseadas de un resumen de tarjeta ───────────────
//
// Claude a veces devuelve una compra en cuotas MÁS DE UNA VEZ cuando el
// resumen la lista en varias secciones (consumos del período + "detalle de
// cuotas a vencer" / "plan de financiación"). Eso produce cuotas repetidas en
// la pantalla de revisión.
//
// Deduplicamos de forma CONSERVADORA: solo colapsamos entradas EN CUOTAS
// (cuotas_total > 1) que comparten compra + cuota + plan. Los consumos de 1
// sola cuota NO se tocan: dos compras iguales el mismo día (ej. dos cafés)
// son legítimas y no queremos perderlas.

export type TxParseada = {
  fecha?:        unknown
  detalle?:      unknown
  monto_ars?:    unknown
  monto_usd?:    unknown
  cuotas?:       unknown
  cuotas_total?: unknown
  [k: string]: unknown
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : String(v ?? '')
}

/**
 * Quita cuotas duplicadas del array de transacciones parseadas.
 * Identidad de una cuota: detalle + monto (ars/usd) + cuota actual + total.
 * Mantiene la primera ocurrencia, descarta las repetidas.
 *
 * Acepta `unknown[]` (lo que devuelve el parse de Claude) y preserva el tipo
 * de cada elemento — solo filtra, no transforma.
 */
export function dedupTransaccionesCuotas<T>(transacciones: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []

  for (const t of transacciones) {
    if (typeof t !== 'object' || t === null) { out.push(t); continue }

    const tx = t as TxParseada
    const total = tx.cuotas_total
    const esCuota = typeof total === 'number' && total > 1

    if (!esCuota) {
      out.push(t)            // consumos de 1 cuota: nunca se dedup-ean
      continue
    }

    const key = [
      norm(tx.detalle),
      norm(tx.monto_ars),
      norm(tx.monto_usd),
      norm(tx.cuotas),
      norm(tx.cuotas_total),
    ].join('|')

    if (seen.has(key)) continue   // cuota duplicada → descartar
    seen.add(key)
    out.push(t)
  }

  return out
}
