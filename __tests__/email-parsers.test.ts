import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  parseMontoAR,
  fechaARtoISO,
  parseInfomistarjetas,
  parseAllInfomistarjetas,
  parseMercadoPago,
  parseMercadoPagoTransferencia,
  parseEmail,
} from '@/lib/email-parsers'

afterEach(() => vi.useRealTimers())

function setNow(utcIso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(utcIso))
}

describe('parseMontoAR', () => {
  it('parsea formato AR con separador de miles y decimal', () => {
    expect(parseMontoAR('53.592,40')).toBe(53592.4)
    expect(parseMontoAR('1.000.000,00')).toBe(1_000_000)
  })

  it('parsea sin decimal', () => {
    expect(parseMontoAR('420.690')).toBe(420690)
  })

  it('parsea solo decimal', () => {
    expect(parseMontoAR('5,00')).toBe(5)
    expect(parseMontoAR('5,99')).toBe(5.99)
  })

  it('parsea entero sin separadores', () => {
    expect(parseMontoAR('100')).toBe(100)
  })
})

describe('fechaARtoISO', () => {
  it('convierte DD/MM/YYYY a YYYY-MM-DD', () => {
    expect(fechaARtoISO('14/04/2026')).toBe('2026-04-14')
    expect(fechaARtoISO('01/12/2025')).toBe('2025-12-01')
  })
})

describe('parseInfomistarjetas', () => {
  it('parsea consumo ARS basico', () => {
    const texto = `Estimado cliente, registramos una autorización de consumo de $ 53.592,40 en el establecimiento OPENPAY*LOS CINCO PINOS , el día 14/04/2026 a las 18:29hs con la tarjeta de L BESSAN NOFAL finalizada en 1955`
    const r = parseInfomistarjetas(texto)
    expect(r).toEqual({
      fecha:       '2026-04-14',
      detalle:     'OPENPAY*LOS CINCO PINOS',
      monto:       53592.4,
      moneda:      'ARS',
      cuotas:      1,
      terminacion: '1955',
      fuente:      'infomistarjetas',
    })
  })

  it('parsea consumo USD', () => {
    const texto = `autorización de consumo de US$ 5,00 en el establecimiento ANTHROPIC , el día 10/05/2026 a las 12:00hs con la tarjeta de X finalizada en 9999`
    const r = parseInfomistarjetas(texto)
    expect(r?.moneda).toBe('USD')
    expect(r?.monto).toBe(5)
    expect(r?.detalle).toBe('ANTHROPIC')
  })

  it('parsea consumo con cuotas', () => {
    const texto = `autorización de consumo de $ 99.600,00 en 18 cuotas en el establecimiento FRAVEGA , el día 14/04/2026 a las 18:29hs con la tarjeta de X finalizada en 1234`
    const r = parseInfomistarjetas(texto)
    expect(r?.cuotas).toBe(18)
    expect(r?.monto).toBe(99600)
  })

  it('devuelve null si no matchea', () => {
    expect(parseInfomistarjetas('texto random')).toBe(null)
    expect(parseInfomistarjetas('autorización pero faltan datos')).toBe(null)
  })
})

describe('parseAllInfomistarjetas', () => {
  it('devuelve array vacio si no hay matches', () => {
    expect(parseAllInfomistarjetas('texto random')).toEqual([])
  })

  it('parsea multiple consumos en un email digest', () => {
    const texto = `
      Novedades de tus transacciones:
      autorización de consumo de $ 1.000,00 en el establecimiento UNO , el día 14/04/2026 a las 10:00hs con la tarjeta de X finalizada en 1111

      También: autorización de consumo de $ 2.000,50 en el establecimiento DOS , el día 14/04/2026 a las 11:00hs con la tarjeta de X finalizada en 2222
    `
    const r = parseAllInfomistarjetas(texto)
    expect(r).toHaveLength(2)
    expect(r[0].detalle).toBe('UNO')
    expect(r[0].monto).toBe(1000)
    expect(r[1].detalle).toBe('DOS')
    expect(r[1].monto).toBe(2000.5)
  })
})

describe('parseMercadoPago', () => {
  it('parsea compra básica', () => {
    setNow('2026-05-10T12:00:00Z')
    const texto = `Le compraste a Zentra
      Pagaste $ 420.690
      Tarjeta Mercado Pago Crédito **** 5783
      1 cuota`
    const r = parseMercadoPago(texto)
    expect(r).toMatchObject({
      detalle:     'Zentra',
      monto:       420690,
      moneda:      'ARS',
      cuotas:      1,
      terminacion: '5783',
      fuente:      'mercadopago',
    })
  })

  it('parsea compra con cuotas', () => {
    setNow('2026-05-10T12:00:00Z')
    const texto = `Le compraste a Garbarino
      Pagaste $ 420.690
      Tarjeta Mercado Pago Crédito **** 5783
      9 cuotas de $ 46.743,33`
    const r = parseMercadoPago(texto)
    expect(r?.cuotas).toBe(9)
    expect(r?.monto).toBe(420690)
  })

  it('usa fecha de hoy (AR)', () => {
    setNow('2026-05-11T02:00:00Z') // 23h del 10 mayo AR
    const texto = `Le compraste a Xtra Pagaste $ 100,00`
    const r = parseMercadoPago(texto)
    expect(r?.fecha).toBe('2026-05-10')
  })

  it('devuelve null si no hay monto', () => {
    expect(parseMercadoPago('texto sin monto')).toBe(null)
  })
})

describe('parseMercadoPagoTransferencia', () => {
  it('parsea "Enviaste $X a Y"', () => {
    setNow('2026-05-10T12:00:00Z')
    const texto = `Tu transferencia fue enviada
      Enviaste $ 5.000,00 a Juan Perez el 10/05/2026`
    const r = parseMercadoPagoTransferencia(texto)
    expect(r).toMatchObject({
      detalle: 'MP → Juan Perez el 10/05/2026',
      monto:   5000,
      moneda:  'ARS',
      cuotas:  1,
      fecha:   '2026-05-10',
    })
  })

  it('usa hoy si no hay fecha explicita', () => {
    setNow('2026-05-10T12:00:00Z')
    const texto = `Transferiste $ 1.000,00 a Ana`
    const r = parseMercadoPagoTransferencia(texto)
    expect(r?.fecha).toBe('2026-05-10')
    expect(r?.detalle).toBe('MP → Ana')
  })

  it('devuelve null si no matchea', () => {
    expect(parseMercadoPagoTransferencia('texto random')).toBe(null)
  })
})

describe('parseEmail (auto-detect)', () => {
  it('detecta infomistarjetas', () => {
    const texto = `autorización de consumo de $ 100,00 en el establecimiento X , el día 14/04/2026 a las 10:00hs con la tarjeta de Y finalizada en 1234`
    expect(parseEmail(texto)?.fuente).toBe('infomistarjetas')
  })

  it('detecta mercadopago compra', () => {
    setNow('2026-05-10T12:00:00Z')
    const texto = `Le compraste a Z Pagaste $ 100,00`
    expect(parseEmail(texto)?.fuente).toBe('mercadopago')
  })

  it('detecta mercadopago transferencia', () => {
    setNow('2026-05-10T12:00:00Z')
    const texto = `Enviaste $ 100,00 a Persona`
    expect(parseEmail(texto)?.fuente).toBe('mercadopago')
  })

  it('devuelve null si nada matchea', () => {
    expect(parseEmail('texto que no es de finanzas')).toBe(null)
  })
})
