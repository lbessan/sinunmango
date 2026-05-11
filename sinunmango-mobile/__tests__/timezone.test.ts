import { describe, it, expect, afterEach, vi } from 'vitest'
import { todayAR, currentMesAR, todayPartsAR } from '@/lib/timezone'

function setNow(utcIso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(utcIso))
}

afterEach(() => vi.useRealTimers())

describe('todayAR', () => {
  it('devuelve fecha en formato YYYY-MM-DD', () => {
    expect(todayAR()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('a las 02h UTC (=23h AR dia anterior) devuelve el día anterior', () => {
    setNow('2026-05-11T02:00:00Z')
    expect(todayAR()).toBe('2026-05-10')
  })

  it('a las 03h UTC (=00h AR) ya devuelve el siguiente día', () => {
    setNow('2026-05-11T03:00:00Z')
    expect(todayAR()).toBe('2026-05-11')
  })

  it('mediodia UTC del 10 mayo (=9h AR del 10) devuelve 2026-05-10', () => {
    setNow('2026-05-10T12:00:00Z')
    expect(todayAR()).toBe('2026-05-10')
  })

  it('cruce de año en AR', () => {
    setNow('2026-01-01T02:00:00Z') // 23h del 31 dic AR
    expect(todayAR()).toBe('2025-12-31')
  })
})

describe('currentMesAR', () => {
  it('devuelve YYYY-MM', () => {
    expect(currentMesAR()).toMatch(/^\d{4}-\d{2}$/)
  })

  it('refleja mes en AR (no UTC)', () => {
    setNow('2026-04-01T02:00:00Z') // 23h del 31 marzo AR
    expect(currentMesAR()).toBe('2026-03')
  })
})

describe('todayPartsAR', () => {
  it('devuelve año/mes/día como números', () => {
    setNow('2026-05-10T12:00:00Z')
    expect(todayPartsAR()).toEqual({ year: 2026, month: 5, day: 10 })
  })

  it('refleja zona AR', () => {
    setNow('2026-05-11T02:30:00Z')
    expect(todayPartsAR()).toEqual({ year: 2026, month: 5, day: 10 })
  })
})
