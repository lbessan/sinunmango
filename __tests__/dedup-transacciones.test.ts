// Tests para dedupTransaccionesCuotas — quita cuotas repetidas del parseo.
import { describe, it, expect } from 'vitest'
import { dedupTransaccionesCuotas } from '@/lib/dedup-transacciones'

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
