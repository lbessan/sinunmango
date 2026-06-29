import { describe, it, expect } from 'vitest'
import {
  calcularPeriodo,
  calcularPeriodoCuenta,
  addMonths,
  stripCuotaSuffix,
  debeDeferirFechas,
} from '@/lib/tarjeta-periodo'

describe('calcularPeriodo', () => {
  describe('cuenta NO tarjeta (efectivo, banco, billetera)', () => {
    it('devuelve el primer dia del mes de la fecha de compra', () => {
      expect(calcularPeriodo('2026-04-15', null, null, false)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-01', null, null, false)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-12-31', null, null, false)).toBe('2026-12-01')
    })

    it('ignora cierre/vence si esTarjeta=false', () => {
      expect(calcularPeriodo('2026-04-15', 25, 10, false)).toBe('2026-04-01')
    })
  })

  describe('tarjeta con cierre/vence en MISMO mes (vence > cierre)', () => {
    // Cierre dia 25, vencimiento dia 28 (mismo ciclo)
    it('compra antes del cierre → vence ESTE mes', () => {
      expect(calcularPeriodo('2026-04-10', 25, 28, true)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-25', 25, 28, true)).toBe('2026-04-01')
    })

    it('compra despues del cierre → vence MES SIGUIENTE', () => {
      expect(calcularPeriodo('2026-04-26', 25, 28, true)).toBe('2026-05-01')
      expect(calcularPeriodo('2026-04-30', 25, 28, true)).toBe('2026-05-01')
    })
  })

  describe('tarjeta con vence en MES SIGUIENTE al cierre (vence <= cierre)', () => {
    // Cierre dia 25, vence dia 10 del mes siguiente
    it('compra antes del cierre → vence MES SIGUIENTE', () => {
      // Compra 5 abril, cierra 25 abril, vence 10 mayo
      expect(calcularPeriodo('2026-04-05', 25, 10, true)).toBe('2026-05-01')
      expect(calcularPeriodo('2026-04-25', 25, 10, true)).toBe('2026-05-01')
    })

    it('compra despues del cierre → vence 2 MESES DESPUES', () => {
      // Compra 27 abril, cierra 25 mayo, vence 10 junio
      expect(calcularPeriodo('2026-04-27', 25, 10, true)).toBe('2026-06-01')
    })
  })

  describe('cruce de año', () => {
    it('diciembre con cierre-vence cruza a enero/febrero', () => {
      // Compra 27 dic, cierra 25 ene, vence 10 feb del año siguiente
      expect(calcularPeriodo('2026-12-27', 25, 10, true)).toBe('2027-02-01')
    })

    it('noviembre antes del cierre con cruce', () => {
      // Compra 5 nov, cierra 25 nov, vence 10 dic
      expect(calcularPeriodo('2026-11-05', 25, 10, true)).toBe('2026-12-01')
    })
  })

  describe('valores inválidos', () => {
    it('cierre o vence null/0 con esTarjeta=true se ignoran', () => {
      // Si falta cierre o vence, se trata como NO tarjeta (sin diferimiento)
      expect(calcularPeriodo('2026-04-15', null, 10, true)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-15', 25, null, true)).toBe('2026-04-01')
      expect(calcularPeriodo('2026-04-15', 0, 10, true)).toBe('2026-04-01')
    })
  })
})

describe('calcularPeriodoCuenta', () => {
  it('cuenta no tarjeta devuelve mes de la fecha', () => {
    expect(calcularPeriodoCuenta('2026-04-15', { tipo_cuenta: 'Efectivo' })).toBe('2026-04-01')
    expect(calcularPeriodoCuenta('2026-04-15', { tipo_cuenta: 'Banco CA' })).toBe('2026-04-01')
  })

  it('cuenta nula o undefined devuelve mes de la fecha', () => {
    expect(calcularPeriodoCuenta('2026-04-15', null)).toBe('2026-04-01')
    expect(calcularPeriodoCuenta('2026-04-15', undefined)).toBe('2026-04-01')
  })

  it('tarjeta sin fechas devuelve mes de la fecha', () => {
    expect(calcularPeriodoCuenta('2026-04-15', { tipo_cuenta: 'Tarjeta Credito' })).toBe('2026-04-01')
    expect(calcularPeriodoCuenta('2026-04-15', {
      tipo_cuenta: 'Tarjeta Credito',
      fecha_cierre_tarjeta: null,
      fecha_vencimiento_tarjeta: '2026-04-10',
    })).toBe('2026-04-01')
  })

  it('tarjeta con fechas calcula correctamente', () => {
    // Cierre dia 25, vence dia 10 del mes siguiente
    expect(calcularPeriodoCuenta('2026-04-05', {
      tipo_cuenta: 'Tarjeta Credito',
      fecha_cierre_tarjeta: '2026-04-25',
      fecha_vencimiento_tarjeta: '2026-05-10',
    })).toBe('2026-05-01')

    // Despues del cierre
    expect(calcularPeriodoCuenta('2026-04-27', {
      tipo_cuenta: 'Tarjeta Credito',
      fecha_cierre_tarjeta: '2026-04-25',
      fecha_vencimiento_tarjeta: '2026-05-10',
    })).toBe('2026-06-01')
  })
})

describe('addMonths', () => {
  it('suma meses dentro del mismo año', () => {
    expect(addMonths('2026-04-15', 1)).toBe('2026-05-15')
    expect(addMonths('2026-04-15', 3)).toBe('2026-07-15')
  })

  it('cruza el año', () => {
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31')
  })

  it('soporta n=0', () => {
    expect(addMonths('2026-04-15', 0)).toBe('2026-04-15')
  })

  it('soporta n negativo', () => {
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

    it('enero 31 + 2 meses → 31 mar (marzo sí tiene 31)', () => {
      expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    })

    it('marzo 31 + 1 mes → 30 abr (abril tiene 30)', () => {
      expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
    })

    it('mayo 31 + 1 mes → 30 jun', () => {
      expect(addMonths('2026-05-31', 1)).toBe('2026-06-30')
    })

    it('año bisiesto: enero 31 + 1 mes → 29 feb en 2028', () => {
      expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    })

    it('clampea al ir hacia atrás también: marzo 31 - 1 mes → 28 feb', () => {
      expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    })

    it('cuota a fin de mes propaga correctamente todo el ciclo', () => {
      // Compra el 31-ene en 6 cuotas: el día debe mantenerse 31 cuando el
      // mes lo permite y bajar al último día cuando no.
      expect(addMonths('2026-01-31', 0)).toBe('2026-01-31')
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
      expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
      expect(addMonths('2026-01-31', 3)).toBe('2026-04-30')
      expect(addMonths('2026-01-31', 4)).toBe('2026-05-31')
      expect(addMonths('2026-01-31', 5)).toBe('2026-06-30')
    })
  })
})

describe('stripCuotaSuffix', () => {
  it('saca "(Cuota N/T)" del final', () => {
    expect(stripCuotaSuffix('COTO (Cuota 5/12)')).toBe('COTO')
    expect(stripCuotaSuffix('Compra de prueba (Cuota 1/3)')).toBe('Compra de prueba')
  })

  it('saca "(Cuota N)" sin total', () => {
    expect(stripCuotaSuffix('COTO (Cuota 5)')).toBe('COTO')
  })

  it('case insensitive', () => {
    expect(stripCuotaSuffix('COTO (cuota 5/12)')).toBe('COTO')
    expect(stripCuotaSuffix('COTO (CUOTA 5/12)')).toBe('COTO')
  })

  it('no toca si no hay sufijo', () => {
    expect(stripCuotaSuffix('COTO sin sufijo')).toBe('COTO sin sufijo')
    expect(stripCuotaSuffix('COTO (otra cosa)')).toBe('COTO (otra cosa)')
  })

  it('maneja null/undefined/empty', () => {
    expect(stripCuotaSuffix(null)).toBe('')
    expect(stripCuotaSuffix(undefined)).toBe('')
    expect(stripCuotaSuffix('')).toBe('')
  })

  it('saca espacios extra antes del sufijo', () => {
    expect(stripCuotaSuffix('COTO   (Cuota 5/12)')).toBe('COTO')
    expect(stripCuotaSuffix('COTO\t(Cuota 5/12)')).toBe('COTO')
  })
})

describe('debeDeferirFechas', () => {
  // Ciclo actual cerró 25-jun, vence 6-jul. Las fechas del próximo ciclo
  // (cierre 23-jul) deben diferirse hasta que pase el vencimiento del 6-jul.
  const VENC_ACTUAL = '2026-07-06'

  it('difiere si hoy es anterior al vencimiento actual', () => {
    // Concilio el 26-jun (apenas cerró el resumen) → diferir
    expect(debeDeferirFechas(VENC_ACTUAL, new Date('2026-06-26T12:00:00'))).toBe(true)
    // Un día antes del venc → todavía diferir
    expect(debeDeferirFechas(VENC_ACTUAL, new Date('2026-07-05T12:00:00'))).toBe(true)
  })

  it('aplica directo el día del vencimiento o después', () => {
    expect(debeDeferirFechas(VENC_ACTUAL, new Date('2026-07-06T12:00:00'))).toBe(false)
    expect(debeDeferirFechas(VENC_ACTUAL, new Date('2026-07-10T12:00:00'))).toBe(false)
  })

  it('sin vencimiento actual → aplica directo (no hay ciclo que proteger)', () => {
    expect(debeDeferirFechas(null,      new Date('2026-06-26T12:00:00'))).toBe(false)
    expect(debeDeferirFechas(undefined, new Date('2026-06-26T12:00:00'))).toBe(false)
  })
})
