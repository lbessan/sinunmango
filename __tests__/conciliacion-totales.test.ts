// Totales de conciliación: los reintegros (Ingreso) RESTAN en ambas monedas.
// Regresión del bug real en Visa Francés: los USD sumaban crudo y daban de más.
import { describe, it, expect } from 'vitest'
import { montoFirmado, sumaFirmada } from '@/lib/conciliacion-totales'

describe('montoFirmado', () => {
  it('Gasto suma, Ingreso (reintegro) resta', () => {
    expect(montoFirmado({ monto: 100, tipo_movimiento: 'Gasto' }, { usarEstimado: false })).toBe(100)
    expect(montoFirmado({ monto: 100, tipo_movimiento: 'Ingreso' }, { usarEstimado: false })).toBe(-100)
  })

  it('ARS usa monto_estimado si está; USD usa monto', () => {
    const m = { monto: 10, monto_estimado: 15000, tipo_movimiento: 'Gasto' }
    expect(montoFirmado(m, { usarEstimado: true })).toBe(15000)   // ARS
    expect(montoFirmado(m, { usarEstimado: false })).toBe(10)     // USD (dólares)
  })
})

describe('sumaFirmada — caso real Visa Francés USD oct/2026', () => {
  // Los 11 movimientos USD reales: 9 gastos + 2 reintegros (Vercel 3.87, Google One 6.45)
  const movsUSD = [
    { monto: 1.99,   tipo_movimiento: 'Gasto' },
    { monto: 6.99,   tipo_movimiento: 'Gasto' },
    { monto: 189.54, tipo_movimiento: 'Gasto' },
    { monto: 3.87,   tipo_movimiento: 'Ingreso' },  // reintegro Vercel
    { monto: 3.03,   tipo_movimiento: 'Gasto' },
    { monto: 6.45,   tipo_movimiento: 'Ingreso' },  // reintegro Google One
    { monto: 19.99,  tipo_movimiento: 'Gasto' },
    { monto: 20.6,   tipo_movimiento: 'Gasto' },
    { monto: 4.99,   tipo_movimiento: 'Gasto' },
    { monto: 6.99,   tipo_movimiento: 'Gasto' },
    { monto: 200,    tipo_movimiento: 'Gasto' },
  ]

  it('netea los reintegros → 443.80 (no 464.44)', () => {
    expect(sumaFirmada(movsUSD, { usarEstimado: false })).toBeCloseTo(443.80, 2)
  })

  it('sin signar daría 464.44 (el número erróneo que mostraba el detalle)', () => {
    const bruto = movsUSD.reduce((a, m) => a + m.monto, 0)
    expect(bruto).toBeCloseTo(464.44, 2)
  })
})
