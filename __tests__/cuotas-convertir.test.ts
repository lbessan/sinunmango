// Tests de planDeCuotas — convertir un consumo suelto en plan de cuotas.
import { describe, it, expect } from 'vitest'
import { planDeCuotas } from '@/lib/cuotas-convertir'
import { calcularPeriodoCuenta } from '@/lib/tarjeta-periodo'

describe('planDeCuotas', () => {
  it('monto TOTAL se divide en N cuotas iguales', () => {
    const p = planDeCuotas({ montoBase: 120000, montoEsTotal: true, cuotasTotal: 12, fechaBase: '2026-10-03' })
    expect(p.montoCuota).toBe(10000)
    expect(p.cuotas).toHaveLength(12)
    expect(p.cuotas[0]).toEqual({ cuota_actual: 1, fecha: '2026-10-03' })
    expect(p.cuotas[11]).toEqual({ cuota_actual: 12, fecha: '2027-09-03' })
  })

  it('monto POR CUOTA se usa tal cual (total = monto × N)', () => {
    const p = planDeCuotas({ montoBase: 10000, montoEsTotal: false, cuotasTotal: 3, fechaBase: '2026-10-03' })
    expect(p.montoCuota).toBe(10000)
    expect(p.cuotas.map(c => c.cuota_actual)).toEqual([1, 2, 3])
  })

  it('divide con decimales redondeando a centavos', () => {
    const p = planDeCuotas({ montoBase: 100000, montoEsTotal: true, cuotasTotal: 3, fechaBase: '2026-10-03' })
    expect(p.montoCuota).toBe(33333.33)
  })

  it('cada cuota avanza un mes desde la fecha de compra', () => {
    const p = planDeCuotas({ montoBase: 300, montoEsTotal: true, cuotasTotal: 3, fechaBase: '2026-01-31' })
    // fin de mes: addMonths clampa (31-ene → 28-feb)
    expect(p.cuotas.map(c => c.fecha)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('composición con el período de la cuenta (tarjeta cierre 12 / vence 18)', () => {
    // Galicia Visa: compra 2026-10-03, 3 cuotas. La cuota 1 cae en el período
    // de octubre; las siguientes, un mes cada una.
    const cuenta = { tipo_cuenta: 'Tarjeta Credito', fecha_cierre_tarjeta: '2026-01-12', fecha_vencimiento_tarjeta: '2026-01-18' }
    const p = planDeCuotas({ montoBase: 90000, montoEsTotal: true, cuotasTotal: 3, fechaBase: '2026-10-03' })
    const periodos = p.cuotas.map(c => calcularPeriodoCuenta(c.fecha, cuenta))
    expect(periodos).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
    expect(p.montoCuota).toBe(30000)
  })

  it('N=1 (o inválido) no rompe: una sola cuota', () => {
    expect(planDeCuotas({ montoBase: 500, montoEsTotal: true, cuotasTotal: 1, fechaBase: '2026-10-03' }).cuotas).toHaveLength(1)
  })
})
