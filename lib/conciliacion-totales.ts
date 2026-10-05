// ─── lib/conciliacion-totales.ts ─────────────────────────────────────────────
//
// Suma FIRMADA de movimientos para los totales de conciliación: los Gastos
// suman y los Ingresos (reintegros / créditos a favor) RESTAN — en un resumen
// de tarjeta un reintegro reduce lo que debés.
//
// Existe porque los totales en USD sumaban el monto crudo (sin signar), así que
// los reintegros se sumaban en vez de restar y el total daba de más (bug real
// en Visa Francés: U$S 464,44 en vez de 443,80 = exactamente 2× los reintegros).
// Ahora ARS y USD usan la MISMA regla.

export type MovFirmable = {
  monto:            number
  monto_estimado?:  number | null
  tipo_movimiento?: string | null
}

/** Monto de UN movimiento, con signo: Ingreso negativo, el resto positivo.
 *  `usarEstimado`: ARS usa monto_estimado (equivalente en pesos) si está;
 *  USD usa el monto en dólares tal cual. */
export function montoFirmado(m: MovFirmable, opts: { usarEstimado: boolean }): number {
  const base = opts.usarEstimado ? (m.monto_estimado ?? m.monto) : m.monto
  return m.tipo_movimiento === 'Ingreso' ? -base : base
}

/** Suma firmada de una lista de movimientos. */
export function sumaFirmada(movs: MovFirmable[], opts: { usarEstimado: boolean }): number {
  return movs.reduce((a, m) => a + montoFirmado(m, opts), 0)
}
