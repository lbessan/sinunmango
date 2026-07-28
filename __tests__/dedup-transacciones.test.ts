// Tests para dedupTransaccionesCuotas — quita cuotas repetidas del parseo.
import { describe, it, expect } from 'vitest'
import { dedupTransaccionesCuotas, marcarYaExistentes, type MovExistente } from '@/lib/dedup-transacciones'

const cuota = (detalle: string, monto: number, c: number, total: number, fecha = '2026-01-05') => ({
  fecha, detalle, monto_ars: monto, monto_usd: null, cuotas: c, cuotas_total: total,
})
const consumo = (detalle: string, monto: number, fecha = '2026-01-05') => ({
  fecha, detalle, monto_ars: monto, monto_usd: null, cuotas: 1, cuotas_total: 1,
})

describe('dedupTransaccionesCuotas', () => {
  it('colapsa una cuota listada dos veces (consumos + plan de cuotas)', () => {
    const txs = [
      cuota('COTO', 50000, 5, 12),
      cuota('COTO', 50000, 5, 12),  // duplicada (otra sección del resumen)
    ]
    const out = dedupTransaccionesCuotas(txs)
    expect(out).toHaveLength(1)
    expect(out[0].detalle).toBe('COTO')
  })

  it('NO colapsa cuotas distintas de la misma compra (5/12 vs 6/12)', () => {
    const txs = [
      cuota('COTO', 50000, 5, 12),
      cuota('COTO', 50000, 6, 12),
    ]
    expect(dedupTransaccionesCuotas(txs)).toHaveLength(2)
  })

  it('NO colapsa consumos de 1 cuota aunque sean idénticos (dos cafés)', () => {
    const txs = [
      consumo('Café Martínez', 3500),
      consumo('Café Martínez', 3500),
    ]
    expect(dedupTransaccionesCuotas(txs)).toHaveLength(2)
  })

  it('dedup es por detalle+monto+cuota+total, ignora diferencia de fecha', () => {
    // El plan de cuotas a veces muestra otra fecha que los consumos.
    const txs = [
      cuota('Garbarino', 12000, 3, 6, '2026-01-10'),
      cuota('Garbarino', 12000, 3, 6, '2026-01-05'),  // misma cuota, fecha distinta
    ]
    expect(dedupTransaccionesCuotas(txs)).toHaveLength(1)
  })

  it('distingue compras distintas con mismo monto y plan', () => {
    const txs = [
      cuota('Garbarino', 12000, 3, 6),
      cuota('Frávega', 12000, 3, 6),
    ]
    expect(dedupTransaccionesCuotas(txs)).toHaveLength(2)
  })

  it('mezcla cuotas + consumos sin romper', () => {
    const txs = [
      cuota('COTO', 50000, 5, 12),
      cuota('COTO', 50000, 5, 12),  // dup
      consumo('Nafta', 20000),
      consumo('Nafta', 20000),       // legítimo, no se toca
    ]
    const out = dedupTransaccionesCuotas(txs)
    expect(out).toHaveLength(3)  // 1 COTO + 2 Nafta
  })

  it('lista vacía → []', () => {
    expect(dedupTransaccionesCuotas([])).toEqual([])
  })
})

// ─── marcarYaExistentes — dedup contra lo ya cargado, sin depender del nombre ──
const tx = (over: Record<string, unknown> = {}) => ({
  fecha: '2026-01-05', detalle: 'Lo que sea', monto_ars: 12000, monto_usd: null,
  cuotas: 3, cuotas_total: 6, es_impuesto: false, es_descuento: false, ...over,
})
const mov = (over: Partial<MovExistente> = {}): MovExistente => ({
  monto: 12000, moneda: 'ARS', fecha: '2026-01-05', cuotas: 3, cuotas_total: 6, ...over,
})

describe('marcarYaExistentes', () => {
  it('marca una cuota ya cargada aunque tenga OTRO nombre (mismo monto+cuota)', () => {
    const out = marcarYaExistentes(
      [tx({ detalle: 'MERPAGO*NEGOCIO NUEVO' })],
      [mov()],  // ya cargado como "Mercado Pago", mismo monto y misma cuota 3/6
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(true)
  })

  it('NO marca si es otra posición de cuota (3/6 vs 4/6)', () => {
    const out = marcarYaExistentes([tx({ cuotas: 4 })], [mov({ cuotas: 3 })]) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(false)
  })

  it('NO marca si el plan difiere (3/6 vs 3/12)', () => {
    const out = marcarYaExistentes([tx({ cuotas_total: 12 })], [mov({ cuotas_total: 6 })]) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(false)
  })

  it('tolera diferencia de centavos al partir cuotas', () => {
    const out = marcarYaExistentes([tx({ monto_ars: 12000.49 })], [mov({ monto: 12000 })]) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(true)
  })

  it('consumo simple: mismo monto + misma fecha + otro nombre → marca', () => {
    const out = marcarYaExistentes(
      [tx({ detalle: 'YPF RUTA 2', cuotas: 1, cuotas_total: 1 })],
      [mov({ cuotas: 1, cuotas_total: 1 })],  // guardado como "Nafta"
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(true)
  })

  it('consumo simple: mismo monto pero DISTINTA fecha → NO marca (repetido legítimo)', () => {
    const out = marcarYaExistentes(
      [tx({ cuotas: 1, cuotas_total: 1, fecha: '2026-01-20' })],
      [mov({ cuotas: 1, cuotas_total: 1, fecha: '2026-01-05' })],
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(false)
  })

  it('matchea consumos en USD por monto_usd', () => {
    const out = marcarYaExistentes(
      [tx({ monto_ars: null, monto_usd: 5, cuotas: 1, cuotas_total: 1 })],
      [mov({ monto: 5, moneda: 'USD', cuotas: 1, cuotas_total: 1 })],
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(true)
  })

  it('NO cruza monedas (USD 5 no matchea ARS 5)', () => {
    const out = marcarYaExistentes(
      [tx({ monto_ars: null, monto_usd: 5, cuotas: 1, cuotas_total: 1 })],
      [mov({ monto: 5, moneda: 'ARS', cuotas: 1, cuotas_total: 1 })],
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(false)
  })

  it('sin existentes → todo ya_existe=false', () => {
    const out = marcarYaExistentes([tx(), tx({ cuotas: 4 })], []) as Array<{ ya_existe: boolean }>
    expect(out.every(o => o.ya_existe === false)).toBe(true)
  })

  it('preserva el resto de los campos de la transacción', () => {
    const out = marcarYaExistentes([tx({ detalle: 'X', es_descuento: true })], [mov()]) as Array<Record<string, unknown>>
    expect(out[0].detalle).toBe('X')
    expect(out[0].es_descuento).toBe(true)
    expect(out[0].ya_existe).toBe(true)
  })
})
