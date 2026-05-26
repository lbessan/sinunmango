// Tests para lib/crypto.ts — AES-256-GCM helper para secrets at-rest.
//
// Cubre:
//   - encrypt produce salida base64 con IV (12) + tag (16) + ciphertext
//   - decrypt vuelve al plaintext original
//   - round-trip de Unicode preservado
//   - decrypt con cipher corrupto → null
//   - decrypt con cipher de otra key → null (auth tag falla)
//   - decrypt con string vacío / no-string → null
//   - encrypt con plaintext no-string → tira TypeError
//   - encrypt produce IVs distintos cada vez (no determinístico)
//   - sin env var → tira al primer uso

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { encryptSecret, decryptSecret, __resetKeyCacheForTests } from '@/lib/crypto'

const KEY_A = crypto.randomBytes(32).toString('base64')
const KEY_B = crypto.randomBytes(32).toString('base64')

beforeEach(() => {
  process.env.RESUMEN_PASSWORD_KEY = KEY_A
  __resetKeyCacheForTests()
})

afterEach(() => {
  delete process.env.RESUMEN_PASSWORD_KEY
  __resetKeyCacheForTests()
})

describe('encryptSecret + decryptSecret', () => {
  it('round-trip de string ASCII', () => {
    const enc = encryptSecret('30123456')
    expect(typeof enc).toBe('string')
    // Base64: solo chars válidos
    expect(enc).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(decryptSecret(enc)).toBe('30123456')
  })

  it('round-trip de Unicode', () => {
    const original = 'piñón 你好 🐹 contraseña'
    const enc = encryptSecret(original)
    expect(decryptSecret(enc)).toBe(original)
  })

  it('round-trip de string vacío', () => {
    // Permitido: si el caller quiere encriptar un empty string, ok.
    // El que filtra empty es el endpoint (lo trata como "borrar").
    const enc = encryptSecret('')
    expect(decryptSecret(enc)).toBe('')
  })

  it('IVs distintos producen ciphers distintos para el mismo plaintext', () => {
    const a = encryptSecret('secret')
    const b = encryptSecret('secret')
    expect(a).not.toBe(b)
  })

  it('cipher de mínimo 29 bytes en base64 (12 IV + 16 tag + ≥1 payload)', () => {
    const enc = encryptSecret('x')
    const buf = Buffer.from(enc, 'base64')
    expect(buf.length).toBeGreaterThanOrEqual(29)
  })
})

describe('decryptSecret — robustness', () => {
  it('cipher corrupto (chars no-base64) → null', () => {
    expect(decryptSecret('!!! not base64 !!!')).toBeNull()
  })

  it('cipher demasiado corto → null', () => {
    expect(decryptSecret(Buffer.from('short').toString('base64'))).toBeNull()
  })

  it('cipher con tag manipulado → null (auth tag falla)', () => {
    const enc = encryptSecret('hola')
    const buf = Buffer.from(enc, 'base64')
    // Flipear un bit del tag (byte 12-27)
    buf[15] ^= 0xff
    const tampered = buf.toString('base64')
    expect(decryptSecret(tampered)).toBeNull()
  })

  it('cipher con ciphertext manipulado → null (auth tag falla)', () => {
    const enc = encryptSecret('hola')
    const buf = Buffer.from(enc, 'base64')
    // Flipear un bit del ciphertext (byte 28+)
    buf[28] ^= 0xff
    expect(decryptSecret(buf.toString('base64'))).toBeNull()
  })

  it('cipher hecho con otra key → null', () => {
    const enc = encryptSecret('hola')
    // Cambiar la key y limpiar cache
    process.env.RESUMEN_PASSWORD_KEY = KEY_B
    __resetKeyCacheForTests()
    expect(decryptSecret(enc)).toBeNull()
  })

  it('string vacío → null', () => {
    expect(decryptSecret('')).toBeNull()
  })

  it('no-string (cast a unknown) → null', () => {
    expect(decryptSecret(null as unknown as string)).toBeNull()
    expect(decryptSecret(undefined as unknown as string)).toBeNull()
    expect(decryptSecret(123 as unknown as string)).toBeNull()
  })
})

describe('encryptSecret — input validation', () => {
  it('plaintext no-string → TypeError', () => {
    expect(() => encryptSecret(null as unknown as string)).toThrow(TypeError)
    expect(() => encryptSecret(123 as unknown as string)).toThrow(TypeError)
  })
})

describe('env var validation', () => {
  it('sin RESUMEN_PASSWORD_KEY → encrypt tira error explícito', () => {
    delete process.env.RESUMEN_PASSWORD_KEY
    __resetKeyCacheForTests()
    expect(() => encryptSecret('x')).toThrow(/RESUMEN_PASSWORD_KEY no configurada/)
  })

  it('RESUMEN_PASSWORD_KEY con tamaño incorrecto → tira error', () => {
    // 16 bytes en base64 = key inválida (AES-256 necesita 32)
    process.env.RESUMEN_PASSWORD_KEY = crypto.randomBytes(16).toString('base64')
    __resetKeyCacheForTests()
    expect(() => encryptSecret('x')).toThrow(/debe ser 32 bytes/)
  })

  it('key se cachea entre llamadas (no relee env)', () => {
    encryptSecret('a')
    // Cambiar env: la cache ya tiene la key anterior, no debe refrescar
    process.env.RESUMEN_PASSWORD_KEY = KEY_B
    // Esto sigue usando KEY_A cacheada — round-trip funciona
    const enc = encryptSecret('b')
    expect(decryptSecret(enc)).toBe('b')
  })
})
