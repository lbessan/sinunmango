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
