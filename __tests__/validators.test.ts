import { describe, it, expect } from 'vitest'
import {
  validateString, validatePositiveNumber, validateFiniteNumber,
  validateInteger, validateEnum, validateISODate, validateId,
  validateHexColor, validateBoolean, optional,
  isString, isFiniteNumber, isInteger, isBoolean, isPlainObject,
} from '@/lib/validators'

describe('isString / isFiniteNumber / isInteger / isBoolean / isPlainObject', () => {
  it('isString', () => {
    expect(isString('hola')).toBe(true)
    expect(isString('')).toBe(true)
    expect(isString(1)).toBe(false)
    expect(isString(null)).toBe(false)
    expect(isString(undefined)).toBe(false)
  })

  it('isFiniteNumber', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(1.5)).toBe(true)
    expect(isFiniteNumber(-1)).toBe(true)
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
    expect(isFiniteNumber('1')).toBe(false)
  })

  it('isInteger', () => {
    expect(isInteger(1)).toBe(true)
    expect(isInteger(0)).toBe(true)
    expect(isInteger(-1)).toBe(true)
    expect(isInteger(1.5)).toBe(false)
    expect(isInteger('1')).toBe(false)
  })

  it('isBoolean', () => {
    expect(isBoolean(true)).toBe(true)
    expect(isBoolean(false)).toBe(true)
    expect(isBoolean(0)).toBe(false)
    expect(isBoolean('true')).toBe(false)
  })

  it('isPlainObject', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('x')).toBe(false)
  })
})

describe('validateString', () => {
  it('acepta strings dentro del rango', () => {
    expect(validateString('hola')).toEqual({ ok: true, data: 'hola' })
  })

  it('hace trim', () => {
    expect(validateString('  hola  ')).toEqual({ ok: true, data: 'hola' })
  })

  it('rechaza no-string', () => {
    expect(validateString(123)).toMatchObject({ ok: false })
    expect(validateString(null)).toMatchObject({ ok: false })
    expect(validateString(undefined)).toMatchObject({ ok: false })
  })

  it('rechaza muy corto', () => {
    expect(validateString('')).toMatchObject({ ok: false })
    expect(validateString('a', { min: 2 })).toMatchObject({ ok: false })
  })

  it('rechaza muy largo', () => {
    expect(validateString('aaaa', { max: 3 })).toMatchObject({ ok: false })
  })

  it('respeta min=0 (permite vacío post-trim)', () => {
    expect(validateString('   ', { min: 0 })).toEqual({ ok: true, data: '' })
  })

  it('mensaje incluye el nombre del field', () => {
    const r = validateString(123, { field: 'nombre_cuenta' })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toContain('nombre_cuenta')
  })
})

describe('validatePositiveNumber', () => {
  it('acepta positivos', () => {
    expect(validatePositiveNumber(1)).toEqual({ ok: true, data: 1 })
    expect(validatePositiveNumber(100.5)).toEqual({ ok: true, data: 100.5 })
  })

  it('rechaza cero por default', () => {
    expect(validatePositiveNumber(0)).toMatchObject({ ok: false })
  })

  it('acepta cero con allowZero=true', () => {
    expect(validatePositiveNumber(0, { allowZero: true })).toEqual({ ok: true, data: 0 })
  })

  it('rechaza negativos', () => {
    expect(validatePositiveNumber(-1)).toMatchObject({ ok: false })
    expect(validatePositiveNumber(-1, { allowZero: true })).toMatchObject({ ok: false })
  })

  it('rechaza NaN/Infinity/no-numero', () => {
    expect(validatePositiveNumber(NaN)).toMatchObject({ ok: false })
    expect(validatePositiveNumber(Infinity)).toMatchObject({ ok: false })
    expect(validatePositiveNumber('5')).toMatchObject({ ok: false })
  })

  it('rechaza fuera de rango', () => {
    expect(validatePositiveNumber(10, { max: 5 })).toMatchObject({ ok: false })
  })
})

describe('validateFiniteNumber', () => {
  it('acepta positivos y negativos', () => {
    expect(validateFiniteNumber(5)).toEqual({ ok: true, data: 5 })
    expect(validateFiniteNumber(-5)).toEqual({ ok: true, data: -5 })
    expect(validateFiniteNumber(0)).toEqual({ ok: true, data: 0 })
  })

  it('respeta min/max', () => {
    expect(validateFiniteNumber(5, { min: 0, max: 10 })).toEqual({ ok: true, data: 5 })
    expect(validateFiniteNumber(-1, { min: 0, max: 10 })).toMatchObject({ ok: false })
    expect(validateFiniteNumber(11, { min: 0, max: 10 })).toMatchObject({ ok: false })
  })
})

describe('validateInteger', () => {
  it('acepta enteros en rango', () => {
    expect(validateInteger(5, { min: 1, max: 10 })).toEqual({ ok: true, data: 5 })
    expect(validateInteger(1, { min: 1, max: 10 })).toEqual({ ok: true, data: 1 })
    expect(validateInteger(10, { min: 1, max: 10 })).toEqual({ ok: true, data: 10 })
  })

  it('rechaza decimales', () => {
    expect(validateInteger(1.5, { min: 1, max: 10 })).toMatchObject({ ok: false })
  })

  it('rechaza fuera de rango', () => {
    expect(validateInteger(0, { min: 1, max: 10 })).toMatchObject({ ok: false })
    expect(validateInteger(11, { min: 1, max: 10 })).toMatchObject({ ok: false })
  })
})

describe('validateEnum', () => {
  const MONEDAS = ['ARS', 'USD'] as const

  it('acepta valores de la lista', () => {
    expect(validateEnum('ARS', MONEDAS)).toEqual({ ok: true, data: 'ARS' })
    expect(validateEnum('USD', MONEDAS)).toEqual({ ok: true, data: 'USD' })
  })

  it('rechaza fuera de la lista', () => {
    expect(validateEnum('EUR', MONEDAS)).toMatchObject({ ok: false })
    expect(validateEnum('ars', MONEDAS)).toMatchObject({ ok: false }) // case-sensitive
  })

  it('rechaza no-strings', () => {
    expect(validateEnum(1, MONEDAS)).toMatchObject({ ok: false })
    expect(validateEnum(null, MONEDAS)).toMatchObject({ ok: false })
  })
})

describe('validateISODate', () => {
  it('acepta fechas ISO válidas', () => {
    expect(validateISODate('2026-04-15')).toEqual({ ok: true, data: '2026-04-15' })
    expect(validateISODate('2026-12-31')).toEqual({ ok: true, data: '2026-12-31' })
  })

  it('rechaza formato distinto', () => {
    expect(validateISODate('2026/04/15')).toMatchObject({ ok: false })
    expect(validateISODate('15-04-2026')).toMatchObject({ ok: false })
    expect(validateISODate('2026-4-15')).toMatchObject({ ok: false })
  })

  // Nota: el validator usa la regex, así que dejamos pasar fechas como
  // "2026-13-01" si el regex no chequea ranges. Lo importante es que
  // new Date() no devuelva Invalid Date.
  it('rechaza fechas obviamente inválidas', () => {
    expect(validateISODate('2026-13-99')).toMatchObject({ ok: false })
  })

  it('rechaza no-strings', () => {
    expect(validateISODate(20260415)).toMatchObject({ ok: false })
    expect(validateISODate(null)).toMatchObject({ ok: false })
  })
})

describe('validateId', () => {
  it('acepta IDs alfanuméricos', () => {
    expect(validateId('abc123')).toEqual({ ok: true, data: 'abc123' })
    expect(validateId('user_id-123')).toEqual({ ok: true, data: 'user_id-123' })
    expect(validateId('UUID-style-ones')).toEqual({ ok: true, data: 'UUID-style-ones' })
  })

  it('rechaza chars raros', () => {
    expect(validateId('abc 123')).toMatchObject({ ok: false }) // espacios
    expect(validateId('abc/123')).toMatchObject({ ok: false }) // slash
    expect(validateId('abc;DROP')).toMatchObject({ ok: false }) // SQL injection paranoia
  })

  it('rechaza vacíos o muy largos', () => {
    expect(validateId('')).toMatchObject({ ok: false })
    expect(validateId('a'.repeat(65))).toMatchObject({ ok: false })
  })
})

describe('validateHexColor', () => {
  it('acepta colores hex de 6 chars', () => {
    expect(validateHexColor('#0d3b6e')).toEqual({ ok: true, data: '#0d3b6e' })
    expect(validateHexColor('#FFFFFF')).toEqual({ ok: true, data: '#FFFFFF' })
  })

  it('rechaza shorthand de 3 chars', () => {
    expect(validateHexColor('#fff')).toMatchObject({ ok: false })
  })

  it('rechaza sin #', () => {
    expect(validateHexColor('0d3b6e')).toMatchObject({ ok: false })
  })

  it('rechaza con chars inválidos', () => {
    expect(validateHexColor('#ZZZZZZ')).toMatchObject({ ok: false })
  })
})

describe('validateBoolean', () => {
  it('acepta true/false', () => {
    expect(validateBoolean(true)).toEqual({ ok: true, data: true })
    expect(validateBoolean(false)).toEqual({ ok: true, data: false })
  })

  it('rechaza truthy/falsy no booleanos', () => {
    expect(validateBoolean(1)).toMatchObject({ ok: false })
    expect(validateBoolean(0)).toMatchObject({ ok: false })
    expect(validateBoolean('true')).toMatchObject({ ok: false })
  })
})

describe('optional', () => {
  it('devuelve null para undefined/null/empty string', () => {
    expect(optional(undefined, v => validateString(v))).toEqual({ ok: true, data: null })
    expect(optional(null, v => validateString(v))).toEqual({ ok: true, data: null })
    expect(optional('', v => validateString(v))).toEqual({ ok: true, data: null })
  })

  it('aplica el validator si hay valor', () => {
    expect(optional('hola', v => validateString(v))).toEqual({ ok: true, data: 'hola' })
  })

  it('propaga error del validator', () => {
    expect(optional(123, v => validateString(v))).toMatchObject({ ok: false })
  })
})
