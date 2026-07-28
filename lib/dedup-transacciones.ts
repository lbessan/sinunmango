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

// ─── Dedup contra movimientos YA cargados (independiente del nombre) ─────────
//
// Marca `ya_existe: true` en cada transacción parseada que coincida con un
// movimiento ya cargado en el período. A diferencia del dedup in-PDF, este
// IGNORA el detalle/nombre: el mismo consumo suele quedar guardado con un
// texto distinto al que trae el resumen (ej. "MERPAGO*NuevoNeg" vs "Mercado
// Pago", o un nombre que el usuario editó a mano). Matcheamos por lo que NO
// cambia: monto + moneda + cuota.
//
//   - Compras en cuotas (cuotas_total > 1): monto por cuota + moneda + posición
//     de la cuota (cuota_actual / cuotas_total). La FECHA no entra — el resumen
//     y el mov guardado muestran fechas distintas para la misma cuota.
//   - Consumos de 1 pago (cuotas_total <= 1): monto + moneda + FECHA. Pedimos la
//     fecha para no colapsar dos compras legítimas del mismo valor en el mismo
//     período (ej. dos cargas de SUBE). Igual ignora el nombre.
//
// Reemplaza al `ya_existe` que antes calculaba Claude por prompt (poco confiable
// cuando el nombre difería). El LLM ahora solo extrae; el dedup lo hace el código.

export type MovExistente = {
  monto:         number          // monto NATIVO por cuota (ARS si moneda ARS, USD si USD)
  moneda?:       string | null   // 'ARS' | 'USD' (default ARS)
  fecha?:        string | null   // YYYY-MM-DD
  cuotas?:       number | null   // cuota actual
  cuotas_total?: number | null
}

function monedaDe(m: unknown): 'USD' | 'ARS' {
  return m === 'USD' || m === 'U$S' ? 'USD' : 'ARS'
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Coincidencia de monto con tolerancia — absorbe redondeos de centavos al
 *  partir una compra en cuotas. */
function montoCoincide(a: number, b: number, moneda: 'USD' | 'ARS'): boolean {
  const tol = moneda === 'USD' ? 0.05 : 1
  return Math.abs(Math.abs(a) - Math.abs(b)) <= tol
}

/**
 * Devuelve las transacciones con `ya_existe` recalculado contra los movs ya
 * cargados. No filtra: marca. La UI usa `ya_existe` para separar "nuevas" de
 * "ya en el sistema" y para no preseleccionar las repetidas.
 */
export function marcarYaExistentes(
  transacciones: readonly unknown[],
  existentes:    readonly MovExistente[],
): unknown[] {
  const tieneExistentes = existentes.length > 0
  return transacciones.map(t => {
    if (typeof t !== 'object' || t === null) return t
    if (!tieneExistentes) return { ...t, ya_existe: false }

    const tx    = t as TxParseada
    const usd   = num(tx.monto_usd)
    const ars   = num(tx.monto_ars)
    const txMon: 'USD' | 'ARS' = usd !== null ? 'USD' : 'ARS'
    const monto = usd !== null ? usd : ars
    if (monto === null) return { ...t, ya_existe: false }

    const txTotal = num(tx.cuotas_total) ?? 1
    const txCuota = num(tx.cuotas) ?? 1
    const esCuota = txTotal > 1

    const ya = existentes.some(e => {
      if (monedaDe(e.moneda) !== txMon) return false
      if (!montoCoincide(monto, e.monto, txMon)) return false
      const eTotal = num(e.cuotas_total) ?? 1
      const eCuota = num(e.cuotas) ?? 1
      if (esCuota) {
        // misma posición de cuota dentro del mismo plan
        return eTotal === txTotal && eCuota === txCuota
      }
      // consumo simple: mismo día (no colapsar repetidos legítimos)
      if (eTotal > 1) return false
      return !!e.fecha && !!tx.fecha && String(e.fecha) === String(tx.fecha)
    })
    return { ...t, ya_existe: ya }
  })
}
