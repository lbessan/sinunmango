import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayAR, currentMesAR, primerDiaMesAR, todayPartsAR } from '@/lib/timezone'

// Helper: setear el reloj a un timestamp UTC específico
function setNow(utcIso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(utcIso))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('todayAR', () => {
  it('devuelve fecha en formato YYYY-MM-DD', () => {
    const result = todayAR()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  describe('caso clave: cambio de día UTC vs AR', () => {
    // AR está en UTC-3 todo el año (no tiene DST desde 2009)

    it('a las 02:00 UTC del 11 mayo (=23h del 10 mayo en AR) devuelve 2026-05-10', () => {
      setNow('2026-05-11T02:00:00Z')
      expect(todayAR()).toBe('2026-05-10')
    })

    it('a las 23:00 UTC del 10 mayo (=20h del 10 mayo en AR) devuelve 2026-05-10', () => {
      setNow('2026-05-10T23:00:00Z')
      expect(todayAR()).toBe('2026-05-10')
    })

    it('a las 03:00 UTC del 11 mayo (=00h del 11 mayo en AR) devuelve 2026-05-11', () => {
      setNow('2026-05-11T03:00:00Z')
      expect(todayAR()).toBe('2026-05-11')
    })

    it('al mediodia UTC del 10 mayo (=9h del 10 mayo en AR) devuelve 2026-05-10', () => {
      setNow('2026-05-10T12:00:00Z')
      expect(todayAR()).toBe('2026-05-10')
    })
  })

  it('cruce de año: 02:00 UTC del 1 enero = 23h del 31 dic AR', () => {
    setNow('2026-01-01T02:00:00Z')
    expect(todayAR()).toBe('2025-12-31')
  })

  it('cruce de mes: 02:00 UTC del 1 abril = 23h del 31 marzo AR', () => {
    setNow('2026-04-01T02:00:00Z')
    expect(todayAR()).toBe('2026-03-31')
  })
})

describe('currentMesAR', () => {
  it('devuelve YYYY-MM', () => {
    expect(currentMesAR()).toMatch(/^\d{4}-\d{2}$/)
  })

  it('refleja el mes en AR, no UTC', () => {
    // 23h del 31 marzo AR (02:00 UTC del 1 abril) sigue siendo marzo
    setNow('2026-04-01T02:00:00Z')
    expect(currentMesAR()).toBe('2026-03')
  })
})

describe('primerDiaMesAR', () => {
  it('devuelve YYYY-MM-01', () => {
    setNow('2026-05-10T12:00:00Z')
    expect(primerDiaMesAR()).toBe('2026-05-01')
  })

  it('refleja el mes en AR', () => {
    setNow('2026-04-01T02:00:00Z')
    expect(primerDiaMesAR()).toBe('2026-03-01')
  })
})

describe('todayPartsAR', () => {
  it('devuelve año/mes/día como números', () => {
    setNow('2026-05-10T12:00:00Z')
    expect(todayPartsAR()).toEqual({ year: 2026, month: 5, day: 10 })
  })

  it('refleja zona AR', () => {
    setNow('2026-05-11T02:30:00Z') // 23:30 AR del día 10
    expect(todayPartsAR()).toEqual({ year: 2026, month: 5, day: 10 })
  })
})
