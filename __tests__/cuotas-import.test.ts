// Tests para expandirCuotasResumen — qué cuotas se crean al importar un resumen.
import { describe, it, expect } from 'vitest'
import { expandirCuotasResumen } from '@/lib/cuotas-import'
import { calcularPeriodo, addMonths } from '@/lib/tarjeta-periodo'

describe('expandirCuotasResumen', () => {
  it('consumo sin cuotas → un solo movimiento tal cual', () => {
    const out = expandirCuotasResumen({ fecha: '2026-08-27', detalle: 'Nafta', cuotas: 1, cuotas_total: 1 })
    expect(out).toEqual([{ fecha: '2026-08-27', cuota_actual: 1, cuotas_total: 1, detalle: 'Nafta' }])
  })

  it('"Cuota 4/12" crea SOLO la 4..12 (las anteriores ya se cobraron)', () => {
    // Regresión del bug real: se creaban las 12 desde la 1 con esta fecha como
    // inicio — inventaba cuotas viejas corridas de mes y cada re-import
    // duplicaba el plan (una compra terminaba cuadruplicada en noviembre).
    const out = expandirCuotasResumen({ fecha: '2026-08-15', detalle: 'Samsung', cuotas: 4, cuotas_total: 12 })
    expect(out).toHaveLength(9)                       // 4,5,...,12
    expect(out[0]).toEqual({ fecha: '2026-08-15', cuota_actual: 4, cuotas_total: 12, detalle: 'Samsung (Cuota 4/12)' })
    expect(out[1].fecha).toBe('2026-09-15')           // avanza un mes por cuota
    expect(out[8]).toMatchObject({ fecha: '2027-04-15', cuota_actual: 12, detalle: 'Samsung (Cuota 12/12)' })
  })

  it('cuota 1/N crea el plan completo (compra nueva del período)', () => {
    const out = expandirCuotasResumen({ fecha: '2026-08-01', detalle: 'TV', cuotas: 1, cuotas_total: 3 })
    expect(out.map(c => c.cuota_actual)).toEqual([1, 2, 3])
  })

  it('última cuota (12/12) crea solo esa', () => {
    const out = expandirCuotasResumen({ fecha: '2026-08-15', detalle: 'X', cuotas: 12, cuotas_total: 12 })
    expect(out).toHaveLength(1)
    expect(out[0].cuota_actual).toBe(12)
  })

  it('datos sucios: cuota fuera de rango se clampa', () => {
    expect(expandirCuotasResumen({ fecha: '2026-08-15', detalle: 'X', cuotas: 15, cuotas_total: 12 })).toHaveLength(1)
    expect(expandirCuotasResumen({ fecha: '2026-08-15', detalle: 'X', cuotas: 0, cuotas_total: 3 })).toHaveLength(3)
  })

  it('fin de mes: clampa al último día del mes destino (31-ene → 28-feb)', () => {
    const out = expandirCuotasResumen({ fecha: '2026-01-31', detalle: 'X', cuotas: 1, cuotas_total: 2 })
    expect(out[1].fecha).toBe('2026-02-28')
  })
})

// ── Anclaje al período del resumen (contrato del caller) ─────────────────────
// tx.fecha es la fecha de COMPRA original (el parser la copia exacta), que
// puede ser meses atrás. El caller (handleImportar) corre las fechas para que
// la cuota ACTUAL caiga en el período del resumen. Este test replica esa
// composición con el ejemplo real del prompt: compra 2026-04-05, cuota 2/3,
// resumen de período 2026-08-01 (cierre 23 / vence 3).
describe('anclaje de cuotas al período del resumen (composición caller)', () => {
  const mesesEntre = (a: string, b: string) => {
    const [ya, ma] = a.split('-').map(Number)
    const [yb, mb] = b.split('-').map(Number)
    return (yb - ya) * 12 + (mb - ma)
  }

  it('la cuota actual cae en el período importado, no en el mes de la compra', () => {
    const tx = { fecha: '2026-04-05', detalle: 'Market', cuotas: 2, cuotas_total: 3 }
    const periodoResumen = '2026-08-01'
    const delta = Math.max(0, mesesEntre(calcularPeriodo(tx.fecha, 23, 3, true), periodoResumen))
    const cuotas = expandirCuotasResumen(tx).map(c => ({ ...c, fecha: addMonths(c.fecha, delta) }))

    // Sin anclaje, la cuota 2 quedaba en ~mayo (período viejo) y desaparecía
    // de la conciliación de agosto. Con anclaje cae exactamente en agosto.
    expect(calcularPeriodo(cuotas[0].fecha, 23, 3, true)).toBe(periodoResumen)
    expect(cuotas[0].cuota_actual).toBe(2)
    // y la última avanza un mes por cuota
    expect(calcularPeriodo(cuotas[1].fecha, 23, 3, true)).toBe('2026-09-01')
    expect(cuotas[1].cuota_actual).toBe(3)
  })
})

