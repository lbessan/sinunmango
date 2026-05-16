import { describe, it, expect } from 'vitest'
import { calcularPeriodo, addMonths, stripCuotaSuffix } from '@/lib/tarjeta-periodo'

describe('calcularPeriodo', () => {
  describe('cuenta NO tarjeta', () => {
    it('devuelve el primer dia del mes de la fecha de compra', () => {
      expect(calcularPeriodo('2026-04-15', null, null, false)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-12-31', null, null, false)).toBe('2026-12-01')
    })

    it('ignora cierre/vence si esTarjeta=false', () => {
      expect(calcularPeriodo('2026-04-15', 25, 10, false)).toBe('2026-04-01')
    })
  })

  describe('tarjeta con vence > cierre (mismo mes)', () => {
    it('compra antes del cierre → vence ESTE mes', () => {
      expect(calcularPeriodo('2026-04-10', 25, 28, true)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-25', 25, 28, true)).toBe('2026-04-01')
    })

    it('compra despues del cierre → vence MES SIGUIENTE', () => {
      expect(calcularPeriodo('2026-04-26', 25, 28, true)).toBe('2026-05-01')
    })
  })

  describe('tarjeta con vence <= cierre (mes siguiente)', () => {
    it('compra antes del cierre → vence MES SIGUIENTE', () => {
      expect(calcularPeriodo('2026-04-05', 25, 10, true)).toBe('2026-05-01')
      expect(calcularPeriodo('2026-04-25', 25, 10, true)).toBe('2026-05-01')
    })

    it('compra despues del cierre → vence 2 MESES DESPUES', () => {
      expect(calcularPeriodo('2026-04-27', 25, 10, true)).toBe('2026-06-01')
    })
  })

  describe('cruce de año', () => {
    it('diciembre cruza a febrero del año siguiente', () => {
      expect(calcularPeriodo('2026-12-27', 25, 10, true)).toBe('2027-02-01')
    })

    it('noviembre antes del cierre cruza a diciembre', () => {
      expect(calcularPeriodo('2026-11-05', 25, 10, true)).toBe('2026-12-01')
    })
  })

  describe('valores inválidos', () => {
    it('cierre o vence null/0 se ignoran', () => {
      expect(calcularPeriodo('2026-04-15', null, 10, true)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-15', 25, null, true)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-15', 0, 10, true)).toBe('2026-04-01')
    })
  })
})

describe('addMonths', () => {
  it('suma meses dentro del año', () => {
    expect(addMonths('2026-04-15', 1)).toBe('2026-05-15')
    expect(addMonths('2026-04-15', 3)).toBe('2026-07-15')
  })

  it('cruza el año', () => {
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31')
  })

  it('soporta n=0 y negativos', () => {
    expect(addMonths('2026-04-15', 0)).toBe('2026-04-15')
    expect(addMonths('2026-04-15', -1)).toBe('2026-03-15')
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15')
  })

  // Edge cases: días que no existen en el mes destino. Antes el código tenía
  // un bug latente: setMonth nativo de JS hace overflow al mes siguiente.
  // new Date('2026-01-31').setMonth(1) → 3-mar (porque feb no tiene 31).
  // El fix clampea al último día del mes destino — convención de tarjetas
  // argentinas para cuotas que caen a fin de mes.
  describe('clamp al último día del mes destino', () => {
    it('enero 31 + 1 mes → 28 feb (no salta a marzo)', () => {
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    })

    it('marzo 31 + 1 mes → 30 abr', () => {
      expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
    })

    it('año bisiesto: enero 31 + 1 mes → 29 feb en 2028', () => {
      expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    })

    it('cuota a fin de mes: 31-ene en 6 cuotas propaga bien', () => {
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
      expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
      expect(addMonths('2026-01-31', 3)).toBe('2026-04-30')
      expect(addMonths('2026-01-31', 5)).toBe('2026-06-30')
    })
  })
})

describe('stripCuotaSuffix', () => {
  it('saca sufijo (Cuota N/T)', () => {
    expect(stripCuotaSuffix('COTO (Cuota 5/12)')).toBe('COTO')
  })

  it('saca sufijo (Cuota N)', () => {
    expect(stripCuotaSuffix('COTO (Cuota 5)')).toBe('COTO')
  })

  it('case insensitive', () => {
    expect(stripCuotaSuffix('COTO (cuota 5/12)')).toBe('COTO')
    expect(stripCuotaSuffix('COTO (CUOTA 5/12)')).toBe('COTO')
  })

  it('no toca si no hay sufijo', () => {
    expect(stripCuotaSuffix('COTO sin sufijo')).toBe('COTO sin sufijo')
  })

  it('maneja null/undefined/empty', () => {
    expect(stripCuotaSuffix(null)).toBe('')
    expect(stripCuotaSuffix(undefined)).toBe('')
    expect(stripCuotaSuffix('')).toBe('')
  })
})
