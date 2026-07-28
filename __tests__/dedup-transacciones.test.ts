// Tests para dedupTransaccionesCuotas — quita cuotas repetidas del parseo.
import { describe, it, expect } from 'vitest'
import { dedupTransaccionesCuotas, marcarYaExistentes, esPagoTarjeta, filtrarPagosTarjeta, type MovExistente } from '@/lib/dedup-transacciones'

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

  it('consumo simple: mismo monto + otro nombre → marca (aunque la fecha difiera)', () => {
    const out = marcarYaExistentes(
      [tx({ detalle: 'YPF RUTA 2', cuotas: 1, cuotas_total: 1, fecha: '2026-01-20' })],
      [mov({ cuotas: 1, cuotas_total: 1, fecha: '2026-01-05' })],  // guardado como "Nafta", otra fecha
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(true)
  })

  it('consumo SIN cuota del resumen matchea una compra guardada EN cuotas (caso Samsung)', () => {
    // "Samsung - Promo BBVA" viene como consumo simple pero está cargado como
    // cuota. Antes se descartaba por el mismatch de estado-de-cuota; ahora
    // matchea porque alcanza monto + moneda cuando alguno no es cuota.
    const out = marcarYaExistentes(
      [tx({ detalle: 'Samsung - Promo BBVA', cuotas: 1, cuotas_total: 1 })],
      [mov({ cuotas: 3, cuotas_total: 12 })],  // guardado en cuotas, mismo monto
    ) as Array<{ ya_existe: boolean }>
    expect(out[0].ya_existe).toBe(true)
  })

  it('1-a-1: 1 cargado + 2 iguales en el resumen → marca solo 1 (el otro queda para importar)', () => {
    const out = marcarYaExistentes(
      [tx({ cuotas: 1, cuotas_total: 1 }), tx({ cuotas: 1, cuotas_total: 1 })],
      [mov({ cuotas: 1, cuotas_total: 1 })],  // solo 1 cargado
    ) as Array<{ ya_existe: boolean }>
    expect(out.filter(o => o.ya_existe)).toHaveLength(1)
    expect(out.filter(o => !o.ya_existe)).toHaveLength(1)
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

describe('esPagoTarjeta / filtrarPagosTarjeta', () => {
  it('detecta pagos de tarjeta', () => {
    expect(esPagoTarjeta('Su pago en pesos')).toBe(true)
    expect(esPagoTarjeta('SU PAGO')).toBe(true)
    expect(esPagoTarjeta('PAGO RECIBIDO')).toBe(true)
    expect(esPagoTarjeta('Pago recibido gracias')).toBe(true)
    expect(esPagoTarjeta('Pago mínimo')).toBe(true)
  })

  it('NO confunde comercios que contienen "pago"', () => {
    expect(esPagoTarjeta('Mercado Pago')).toBe(false)
    expect(esPagoTarjeta('Openpay Mi Apet SRL')).toBe(false)
    expect(esPagoTarjeta('Rapipago Sucursal')).toBe(false)
    expect(esPagoTarjeta('Pago Fácil')).toBe(false)          // "pago" pero no seguido de recibido/en pesos/etc
    expect(esPagoTarjeta('Pago Mis Cuentas')).toBe(false)
  })

  it('filtra el pago pero deja los consumos', () => {
    const txs = [
      { detalle: 'Su pago en pesos', monto_ars: 545412.11, es_descuento: true },
      { detalle: 'Samsung - Promo BBVA', monto_ars: 61388.83, es_descuento: false },
      { detalle: 'Mercado Pago Uber', monto_ars: 5000, es_descuento: false },
    ]
    const out = filtrarPagosTarjeta(txs) as Array<{ detalle: string }>
    expect(out).toHaveLength(2)
    expect(out.map(o => o.detalle)).toEqual(['Samsung - Promo BBVA', 'Mercado Pago Uber'])
  })

  it('tolera elementos no-objeto sin romper', () => {
    expect(filtrarPagosTarjeta([null, 'x', { detalle: 'Su pago en pesos' }])).toEqual([null, 'x'])
  })
})
