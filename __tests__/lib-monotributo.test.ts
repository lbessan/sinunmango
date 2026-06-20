// Tests para lib/monotributo — helpers puros de cálculo
import { describe, it, expect } from 'vitest'
import {
  facturacionUltimos12Meses,
  gaugeStatus,
  proyeccionMesesHastaLimite,
  facturasAgrupadasPorCliente,
  facturacionPorMes,
  type FacturaEmitida,
} from '@/lib/monotributo'

const mkFact = (fecha: string, monto: number, cliente = 'Cliente'): FacturaEmitida => ({
  id: `${fecha}-${monto}`,
  fecha,
  cliente,
  monto,
})

// Fecha fija para los tests — evita flakiness por now()
const HOY = new Date('2026-06-20T12:00:00')

describe('facturacionUltimos12Meses', () => {
  it('suma facturas dentro de la ventana de 12 meses', () => {
    const facturas = [
      mkFact('2026-01-15', 100_000),
      mkFact('2025-08-10', 50_000),
      mkFact('2025-07-01', 30_000),  // dentro (hace ~11 meses)
    ]
    expect(facturacionUltimos12Meses(facturas, HOY)).toBe(180_000)
  })

  it('excluye facturas más viejas que 12 meses', () => {
    const facturas = [
      mkFact('2026-01-15', 100_000),
      mkFact('2024-12-15', 999_999),  // fuera (>12m)
    ]
    expect(facturacionUltimos12Meses(facturas, HOY)).toBe(100_000)
  })

  it('lista vacía devuelve 0', () => {
    expect(facturacionUltimos12Meses([], HOY)).toBe(0)
  })
})

describe('gaugeStatus', () => {
  it('< 80% del límite → ok', () => {
    expect(gaugeStatus(50_000, 100_000)).toBe('ok')
    expect(gaugeStatus(79_999, 100_000)).toBe('ok')
  })
  it('80%-94% del límite → warning', () => {
    expect(gaugeStatus(80_000, 100_000)).toBe('warning')
    expect(gaugeStatus(94_999, 100_000)).toBe('warning')
  })
  it('>= 95% del límite → danger', () => {
    expect(gaugeStatus(95_000, 100_000)).toBe('danger')
    expect(gaugeStatus(120_000, 100_000)).toBe('danger')
  })
  it('límite cero o negativo → ok (no divide por cero)', () => {
    expect(gaugeStatus(5000, 0)).toBe('ok')
  })
})

describe('proyeccionMesesHastaLimite', () => {
  it('proyecta basado en promedio últimos 3 meses', () => {
    // 3 facturas de los últimos 3 meses, $1M cada una → promedio mensual $1M
    // Límite $10M, facturado12 = $3M, restante = $7M → 7 meses
    const facturas = [
      mkFact('2026-06-01', 1_000_000),
      mkFact('2026-05-01', 1_000_000),
      mkFact('2026-04-01', 1_000_000),
    ]
    const result = proyeccionMesesHastaLimite(facturas, 10_000_000, 3_000_000, HOY)
    expect(result).toBe(7)
  })

  it('si ya pasó el límite → 0', () => {
    const result = proyeccionMesesHastaLimite([mkFact('2026-06-01', 100)], 1_000_000, 1_500_000, HOY)
    expect(result).toBe(0)
  })

  it('sin facturas recientes → null', () => {
    expect(proyeccionMesesHastaLimite([], 1_000_000, 0, HOY)).toBe(null)
  })

  it('límite <= 0 → null', () => {
    expect(proyeccionMesesHastaLimite([mkFact('2026-06-01', 1000)], 0, 0, HOY)).toBe(null)
  })
})

describe('facturasAgrupadasPorCliente', () => {
  it('agrupa por nombre normalizado (trim + lowercase)', () => {
    const facturas = [
      mkFact('2026-06-01', 1000, 'Cliente A'),
      mkFact('2026-06-15', 2000, 'cliente a '),  // mismo, distinta case + trailing space
      mkFact('2026-06-10', 500,  'Cliente B'),
    ]
    const grupos = facturasAgrupadasPorCliente(facturas)
    expect(grupos).toHaveLength(2)
    expect(grupos[0].cliente).toBe('Cliente A')  // mantiene capitalización del primero
    expect(grupos[0].total).toBe(3000)
    expect(grupos[0].count).toBe(2)
    expect(grupos[0].ultimaFecha).toBe('2026-06-15')
  })

  it('ordena por total desc', () => {
    const facturas = [
      mkFact('2026-06-01', 500,  'Pequeño'),
      mkFact('2026-06-01', 5000, 'Grande'),
    ]
    const grupos = facturasAgrupadasPorCliente(facturas)
    expect(grupos[0].cliente).toBe('Grande')
    expect(grupos[1].cliente).toBe('Pequeño')
  })

  it('ignora cliente vacío', () => {
    const facturas = [
      { ...mkFact('2026-06-01', 100, ''), cliente: '   ' },
      mkFact('2026-06-01', 100, 'Real'),
    ]
    const grupos = facturasAgrupadasPorCliente(facturas)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].cliente).toBe('Real')
  })
})

describe('facturacionPorMes', () => {
  it('genera N meses con totales', () => {
    const facturas = [
      mkFact('2026-06-15', 1000),
      mkFact('2026-05-15', 500),
    ]
    const meses = facturacionPorMes(facturas, 3, HOY)
    expect(meses).toHaveLength(3)
    expect(meses[2].mes).toBe('2026-06')
    expect(meses[2].total).toBe(1000)
    expect(meses[1].mes).toBe('2026-05')
    expect(meses[1].total).toBe(500)
    expect(meses[0].mes).toBe('2026-04')
    expect(meses[0].total).toBe(0)
  })

  it('facturas fuera de la ventana no se cuentan', () => {
    const facturas = [mkFact('2025-01-15', 9999)]
    const meses = facturacionPorMes(facturas, 3, HOY)
    expect(meses.every(m => m.total === 0)).toBe(true)
  })
})
