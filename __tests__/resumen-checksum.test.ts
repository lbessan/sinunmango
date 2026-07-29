// Tests para verificarResumen — el checksum que valida la extracción de un
// resumen contra los totales que el propio resumen declara.
import { describe, it, expect } from 'vitest'
import { verificarResumen } from '@/lib/resumen-checksum'

// Datos REALES del resumen Galicia Visa Platinum (16-Jul-26) de Lucho.
// 14 consumos en cuotas que suman 157.381,23 + Impuesto de Sellos 1.888,57.
const CONSUMOS_GALICIA = [
  14571.05, 3342.16, 12222.16, 12222.11, 1888.27, 17729.55, 17497.11,
  18946.61, 4015.33, 5533.33, 3083.27, 6899.94, 22053.33, 17377.01,
].map(m => ({ monto_ars: m, es_impuesto: false, es_descuento: false }))
const SELLOS_GALICIA = { monto_ars: 1888.57, es_impuesto: true, es_descuento: false }
const CONTROL_GALICIA = {
  saldo_anterior: 187197.05,
  pago:           187197.05,
  saldo_actual:   159269.80,
  total_consumos: 157381.23,
}

describe('verificarResumen — caso real Galicia', () => {
  it('cuadra la ecuación del resumen al centavo', () => {
    const v = verificarResumen([...CONSUMOS_GALICIA, SELLOS_GALICIA], CONTROL_GALICIA)
    expect(v.aplicable).toBe(true)
    expect(v.cuadra).toBe(true)
    expect(v.diferencia).toBe(0)
    expect(v.sumaConsumos).toBe(157381.23)
    expect(v.sumaImpuestos).toBe(1888.57)
  })

  it('DETECTA cuando se cuela una cuota a vencer (el bug de Lucho)', () => {
    // Si el modelo mete de más un consumo fantasma (ej. una cuota a vencer),
    // la ecuación deja de cerrar y lo avisamos.
    const fantasma = { monto_ars: 157381.23, es_impuesto: false, es_descuento: false }
    const v = verificarResumen([...CONSUMOS_GALICIA, SELLOS_GALICIA, fantasma], CONTROL_GALICIA)
    expect(v.cuadra).toBe(false)
    expect(v.diferencia).toBe(157381.23)
    expect(v.mensaje).toMatch(/no cuadra/i)
  })

  it('DETECTA cuando falta un consumo', () => {
    const v = verificarResumen([...CONSUMOS_GALICIA.slice(1), SELLOS_GALICIA], CONTROL_GALICIA)
    expect(v.cuadra).toBe(false)
    // faltó el primero (14.571,05) → el saldo esperado queda corto
    expect(v.diferencia).toBe(-14571.05)
  })
})

describe('verificarResumen — comportamiento general', () => {
  it('resta los descuentos en la ecuación', () => {
    const v = verificarResumen(
      [
        { monto_ars: 10000, es_impuesto: false, es_descuento: false },
        { monto_ars: 3000,  es_impuesto: false, es_descuento: true  },  // crédito a favor
      ],
      { saldo_anterior: 0, pago: 0, saldo_actual: 7000 },
    )
    expect(v.cuadra).toBe(true)
    expect(v.sumaDescuentos).toBe(3000)
  })

  it('ignora consumos en USD para el checksum ARS', () => {
    const v = verificarResumen(
      [
        { monto_ars: 10000, es_impuesto: false, es_descuento: false },
        { monto_ars: null, monto_usd: 50, es_impuesto: false, es_descuento: false },
      ],
      { saldo_anterior: 0, pago: 0, saldo_actual: 10000 },
    )
    expect(v.cuadra).toBe(true)
    expect(v.sumaConsumos).toBe(10000)
  })

  it('lee su_pago (el nombre que devuelve el modelo, no solo "pago")', () => {
    const v = verificarResumen(
      [{ monto_ars: 10000, es_impuesto: false, es_descuento: false }],
      { saldo_anterior: 5000, su_pago: 5000, saldo_actual: 10000 },
    )
    expect(v.cuadra).toBe(true)
  })

  it('usa total_consumos como fallback si no hay saldos', () => {
    const v = verificarResumen(
      [{ monto_ars: 50000, es_impuesto: false, es_descuento: false }],
      { total_consumos: 50000 },
    )
    expect(v.aplicable).toBe(true)
    expect(v.cuadra).toBe(true)
  })

  it('no aplicable si el resumen no declaró totales', () => {
    const v = verificarResumen([{ monto_ars: 50000 }], {})
    expect(v.aplicable).toBe(false)
    expect(v.cuadra).toBe(false)
  })

  it('tolera diferencias de hasta $1 (redondeo)', () => {
    const v = verificarResumen(
      [{ monto_ars: 10000.4, es_impuesto: false, es_descuento: false }],
      { saldo_anterior: 0, pago: 0, saldo_actual: 10000 },
    )
    expect(v.cuadra).toBe(true)
  })
})
