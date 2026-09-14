// ─── lib/cuotas-import.ts ────────────────────────────────────────────────────
//
// Expansión de una línea de resumen con cuotas ("C.04/12 ... $X") a los
// movimientos que hay que crear.
//
// REGLA: el resumen informa la cuota ACTUAL. Las cuotas anteriores ya fueron
// cobradas en resúmenes anteriores (y en general ya están cargadas), así que
// se crean SOLO la actual y las que faltan: 4/12 → cuotas 4..12, un mes por
// cuota a partir de la fecha dada.
//
// OJO — ANCLAJE: la fecha de la línea del resumen es la fecha de COMPRA
// original (puede ser meses atrás). Este módulo genera fechas RELATIVAS a la
// fecha que recibe; es responsabilidad del caller correrlas para que la cuota
// actual caiga en el período del resumen que está importando (ver
// handleImportar en conciliacion-controls, que aplica el delta de meses).
//
// El bug que esto reemplaza: se creaban SIEMPRE las 12 desde la cuota 1 con
// la fecha de la línea como inicio — inventaba cuotas viejas corridas de mes
// y cada re-import duplicaba el plan entero.

import { addMonths } from './tarjeta-periodo'

export type CuotaGenerada = {
  fecha:        string   // YYYY-MM-DD
  cuota_actual: number
  cuotas_total: number
  detalle:      string
}

/**
 * Genera las cuotas a crear para una línea del resumen.
 * - Sin cuotas (total <= 1): un único movimiento con la fecha y el detalle tal cual.
 * - Con cuotas: desde la cuota actual hasta la última, un mes por cuota.
 * Tolera datos sucios: actual fuera de rango se clampa a [1, total].
 */
export function expandirCuotasResumen(tx: {
  fecha:        string
  detalle:      string
  cuotas:       number
  cuotas_total: number
}): CuotaGenerada[] {
  const total = Math.max(1, Math.trunc(tx.cuotas_total) || 1)
  if (total <= 1) {
    return [{ fecha: tx.fecha, cuota_actual: 1, cuotas_total: 1, detalle: tx.detalle }]
  }
  const actual = Math.min(total, Math.max(1, Math.trunc(tx.cuotas) || 1))
  return Array.from({ length: total - actual + 1 }, (_, i) => ({
    fecha:        addMonths(tx.fecha, i),
    cuota_actual: actual + i,
    cuotas_total: total,
    detalle:      `${tx.detalle} (Cuota ${actual + i}/${total})`,
  }))
}

/**
 * ¿Esta transacción parseada del resumen se puede importar? Devuelve el motivo
 * (string) si NO, o null si está OK.
 *
 * El parser a veces devuelve filas degradadas (un chunk que recuperó parcial):
 * sin fecha, sin monto, o con cuotas_total mal leído. Antes UNA sola de estas
 * filas hacía que el POST rechazara el lote ENTERO con un error genérico e
 * invisible — el usuario perdía toda la categorización. Ahora las detectamos
 * en el cliente, las dejamos afuera y le decimos exactamente cuál y por qué.
 *
 * Los límites (monto > 0, cuotas_total 1..60) son los mismos que valida el
 * endpoint /api/movimientos, así que lo que pasa este filtro entra seguro.
 */
export function motivoTxNoImportable(tx: {
  fecha:        string | null
  detalle?:     string | null
  monto_ars:    number | null
  monto_usd:    number | null
  cuotas_total: number
}): string | null {
  if (!tx.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(tx.fecha)) return 'sin fecha válida'
  const monto = tx.monto_usd ?? Math.abs(tx.monto_ars ?? 0)
  if (!Number.isFinite(monto) || monto <= 0) return 'sin monto'
  const total = Math.trunc(tx.cuotas_total)
  if (total > 60) return `cuotas fuera de rango (${total})`
  // El detalle importado lleva " (Cuota X/YY)" agregado; el tope del endpoint
  // es 500. Dejamos margen para el sufijo.
  if ((tx.detalle ?? '').length > 480) return 'detalle demasiado largo'
  return null
}

/**
 * Corrige el AÑO de un consumo suelto usando el período del resumen.
 *
 * Por qué: los PDFs de resumen (MP y otros) muestran los consumos con día/mes
 * pero SIN año en cada línea. El modelo entonces alucina el año (leyó 2024 en
 * un resumen de 2026). El día y el mes SÍ son confiables. Y un consumo suelto
 * siempre pertenece al ciclo de ESTE resumen, así que su año es el del período
 * — no el que haya inventado el parser.
 *
 * Regla: se toma el día/mes del parser y se elige el año que ubica esa fecha
 * en/antes del período. Si el mes del consumo es <= el mes del período, es el
 * año del período; si es mayor (ej. un consumo de diciembre en un resumen que
 * vence en enero), es el año anterior.
 *
 * OJO: esto es SOLO para sueltos (cuotas_total <= 1). Las cuotas conservan su
 * fecha de compra original (puede ser de años atrás, legítimamente) y se anclan
 * por meses en el caller — ahí el año se corrige solo al correr las fechas.
 */
export function fecharConsumoEnPeriodo(fecha: string, periodo: string): string {
  const [, mStr, dStr] = fecha.split('-')
  const m = Number(mStr), d = Number(dStr)
  const [pyStr, pmStr] = periodo.split('-')
  const py = Number(pyStr), pm = Number(pmStr)
  // Datos raros: no tocamos (que lo agarre el guard de importabilidad).
  if (!m || !d || !py || !pm) return fecha
  const anio = pm >= m ? py : py - 1
  // Clamp del día al último del mes destino (ej. 31 en un mes de 30).
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const dd = Math.min(d, ultimo)
  return `${anio}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
