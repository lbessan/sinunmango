// ─── lib/cuotas-convertir.ts ─────────────────────────────────────────────────
//
// Convertir un consumo SUELTO (ya cargado) en un plan de cuotas.
//
// Para qué: las Alertas de Compras Visa (y notis parecidas) informan el consumo
// pero NO dicen si fue en cuotas — traen el total autorizado. Entonces una
// compra en 12 cuotas entra como un único consumo. Esto arma el plan: toma el
// movimiento existente como cuota 1 y calcula las cuotas 2..N (una por mes).
//
// La fecha base es la de la compra (la del movimiento). Cada cuota avanza un
// mes; el PERÍODO de cada una lo calcula el caller con calcularPeriodoCuenta
// (depende de la cuenta), que ya está testeado aparte.

import { addMonths } from './tarjeta-periodo'

const round2 = (n: number) => Math.round(n * 100) / 100

export type PlanCuotas = {
  /** Monto de CADA cuota (todas iguales, como en el resumen). */
  montoCuota: number
  cuotas: { cuota_actual: number; fecha: string }[]
}

/**
 * Arma el plan de cuotas a partir de un movimiento suelto.
 * - montoEsTotal=true  → el monto cargado es el TOTAL de la compra → se divide.
 * - montoEsTotal=false → el monto cargado es el de UNA cuota → se usa tal cual.
 */
export function planDeCuotas(opts: {
  montoBase:    number
  montoEsTotal: boolean
  cuotasTotal:  number
  fechaBase:    string
}): PlanCuotas {
  const n = Math.max(1, Math.trunc(opts.cuotasTotal) || 1)
  const montoCuota = opts.montoEsTotal ? round2(opts.montoBase / n) : round2(opts.montoBase)
  const cuotas = Array.from({ length: n }, (_, i) => ({
    cuota_actual: i + 1,
    fecha:        addMonths(opts.fechaBase, i),
  }))
  return { montoCuota, cuotas }
}
