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
// Marca `ya_existe: true` en cada transacción parseada que ya está cargada en el
// período. IGNORA el detalle/nombre (el mismo consumo suele quedar guardado con
// otro texto: "MERPAGO*X" vs "Mercado Pago", o un nombre que el user editó a
// mano) y también la FECHA (el resumen y el mov guardado muestran fechas
// distintas seguido). El único dato confiable es el MONTO + moneda.
//
// La posición de cuota se usa SOLO para desempatar cuando AMBOS lados son
// compras en cuotas (así no confundimos cuota 3/6 con 5/6 del mismo valor). Si
// alguno de los dos NO tiene cuotas, alcanza con monto + moneda — antes exigía
// fecha idéntica y descartaba si el estado de cuota no coincidía, y eso hacía
// que un consumo con el mismo valor exacto se ofreciera como nuevo.
//
// Matching 1-a-1: cada mov ya cargado "consume" a lo sumo una transacción del
// resumen. Si tenés 1 cargado y el resumen trae 2 iguales, solo 1 se marca como
// repetido y el otro queda para importar.
//
// Reemplaza al `ya_existe` que antes calculaba Claude por prompt.

export type MovExistente = {
  monto:         number          // monto NATIVO por cuota (ARS si moneda ARS, USD si USD)
  moneda?:       string | null   // 'ARS' | 'USD' (default ARS)
  fecha?:        string | null   // ya no se usa en el match; se deja por compat
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

/** Coincidencia de monto con tolerancia — absorbe redondeos de centavos. */
function montoCoincide(a: number, b: number, moneda: 'USD' | 'ARS'): boolean {
  const tol = moneda === 'USD' ? 0.05 : 1
  return Math.abs(Math.abs(a) - Math.abs(b)) <= tol
}

type Rasgos = { moneda: 'USD' | 'ARS'; monto: number; total: number; cuota: number; esCuota: boolean }

function rasgosTx(tx: TxParseada): Rasgos | null {
  const usd = num(tx.monto_usd)
  const ars = num(tx.monto_ars)
  const moneda: 'USD' | 'ARS' = usd !== null ? 'USD' : 'ARS'
  const monto = usd !== null ? usd : ars
  if (monto === null) return null
  const total = num(tx.cuotas_total) ?? 1
  const cuota = num(tx.cuotas) ?? 1
  return { moneda, monto, total, cuota, esCuota: total > 1 }
}

function rasgosMov(e: MovExistente): Rasgos {
  const total = num(e.cuotas_total) ?? 1
  const cuota = num(e.cuotas) ?? 1
  return { moneda: monedaDe(e.moneda), monto: e.monto, total, cuota, esCuota: total > 1 }
}

function coincide(a: Rasgos, b: Rasgos): boolean {
  if (a.moneda !== b.moneda) return false
  if (!montoCoincide(a.monto, b.monto, a.moneda)) return false
  // Ambos en cuotas → misma posición de cuota. Si alguno no es cuota, monto +
  // moneda alcanza (nombre y fecha no son confiables).
  if (a.esCuota && b.esCuota) return a.cuota === b.cuota && a.total === b.total
  return true
}

/**
 * Devuelve las transacciones con `ya_existe` recalculado contra los movs ya
 * cargados (match 1-a-1 por monto + moneda, sin depender del nombre ni la
 * fecha). No filtra: marca. La UI usa `ya_existe` para separar "nuevas" de "ya
 * en el sistema" y para no preseleccionar las repetidas.
 */
export function marcarYaExistentes(
  transacciones: readonly unknown[],
  existentes:    readonly MovExistente[],
): unknown[] {
  const pool  = existentes.map(rasgosMov)
  const usado = new Array(pool.length).fill(false)

  return transacciones.map(t => {
    if (typeof t !== 'object' || t === null) return t
    const r = rasgosTx(t as TxParseada)
    if (!r) return { ...t, ya_existe: false }

    // Primer mov ya cargado, todavía sin usar, que coincida (1-a-1).
    let idx = -1
    for (let i = 0; i < pool.length; i++) {
      if (usado[i]) continue
      if (coincide(r, pool[i])) { idx = i; break }
    }
    if (idx >= 0) usado[idx] = true
    return { ...t, ya_existe: idx >= 0 }
  })
}

// ─── Pagos de la tarjeta (NO son consumos ni descuentos) ─────────────────────
//
// El pago del resumen anterior ("Su pago en pesos", "PAGO RECIBIDO", "Pago
// mínimo", etc.) a veces lo devuelve el parser como un crédito a favor
// (es_descuento). No es un gasto ni un descuento: es la cancelación del saldo.
// Lo sacamos por completo. Anclado al inicio del detalle para no pisar comercios
// que contengan "pago" (Mercado Pago, Openpay, Rapipago, Pago Fácil).

const RE_PAGO_TARJETA = /^\s*(su\s+pago\b|pago\s+(recibido|en\s+pesos|online|efectuado|m[ií]nimo|total|realizado))/i

export function esPagoTarjeta(detalle: unknown): boolean {
  return typeof detalle === 'string' && RE_PAGO_TARJETA.test(detalle)
}

/** Saca los pagos de la tarjeta del array de transacciones parseadas. */
export function filtrarPagosTarjeta(transacciones: readonly unknown[]): unknown[] {
  return transacciones.filter(t => {
    if (typeof t !== 'object' || t === null) return true
    return !esPagoTarjeta((t as { detalle?: unknown }).detalle)
  })
}
