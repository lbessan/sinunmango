// Tests para PATCH /api/tarjetas/[id], focalizados en el nuevo campo
// `resumen_password` (plaintext del cliente → encriptado at-rest).
//
// Cubre:
//   - 401 sin auth
//   - 400 con JSON inválido / sin updates
//   - 400 con resumen_password no-string
//   - resumen_password vacío / null → updates.resumen_password_cipher = null (borrar)
//   - resumen_password con valor → encripta y manda como cipher al UPDATE
//   - el plaintext NUNCA se envía al UPDATE — solo el cipher
//   - update normal sin tocar password no manda el campo cipher

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// La key de crypto la seteamos antes de importar el endpoint (el módulo
// crypto.ts es cacheable pero leemos lazy → ok setearla acá).
process.env.RESUMEN_PASSWORD_KEY = crypto.randomBytes(32).toString('base64')

import { PATCH } from '@/app/api/tarjetas/[id]/route'
import { decryptSecret, __resetKeyCacheForTests } from '@/lib/crypto'

beforeEach(() => {
  createClientMock.mockReset()
  __resetKeyCacheForTests()
})

afterEach(() => {
  vi.clearAllMocks()
})

// Helper: arma un mock supabase que captura el body del .update() para
// que el test pueda chequearlo. Devuelve un objeto con `updateCalls` que
// guarda lo que se le pasó a .update().
function setupSupabase() {
  const updateCalls: Array<Record<string, unknown>> = []
  const chain = {
    eq: vi.fn(function (this: unknown) { return this }),
    update: vi.fn(function (this: unknown, data: Record<string, unknown>) {
      updateCalls.push(data)
      return this
    }),
    then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
  }
  // Chain.eq devuelve el mismo chain (incluyendo .then). Para que termine
  // resolviendo necesitamos que la última .eq devuelva un thenable.
  Object.setPrototypeOf(chain, { then: chain.then })

  const supabase = {
    from: vi.fn(() => chain),
  }
  return { supabase, updateCalls }
}

function makeReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/tarjetas/${id}`, {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ID = 'cta_test'

describe('PATCH /api/tarjetas/[id] — resumen_password', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await PATCH(
      makeReq(ID, { resumen_password: '30123456' }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(401)
  })

  it('400 con JSON inválido', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase: setupSupabase().supabase })
    const res = await PATCH(
      makeReq(ID, 'not json'),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(400)
  })

  it('400 sin updates', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase: setupSupabase().supabase })
    const res = await PATCH(
      makeReq(ID, {}),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(400)
  })

  it('400 si resumen_password no es string ni null', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase: setupSupabase().supabase })
    const res = await PATCH(
      makeReq(ID, { resumen_password: 12345 }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(400)
  })

  it('resumen_password = null → seteamos cipher = null (borrar)', async () => {
    const { supabase, updateCalls } = setupSupabase()
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase })

    const res = await PATCH(
      makeReq(ID, { resumen_password: null }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].resumen_password_cipher).toBeNull()
    // El campo plaintext nunca se manda a la DB (solo el _cipher)
    expect('resumen_password' in updateCalls[0]).toBe(false)
  })

  it('resumen_password = "" (string vacío) → cipher = null (borrar)', async () => {
    const { supabase, updateCalls } = setupSupabase()
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase })

    const res = await PATCH(
      makeReq(ID, { resumen_password: '' }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(200)
    expect(updateCalls[0].resumen_password_cipher).toBeNull()
  })

  it('resumen_password con valor → cipher encriptado + round-trip funciona', async () => {
    const { supabase, updateCalls } = setupSupabase()
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase })

    const res = await PATCH(
      makeReq(ID, { resumen_password: '30123456' }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(200)

    const cipher = updateCalls[0].resumen_password_cipher as string
    expect(typeof cipher).toBe('string')
    // El cipher NO es el plaintext
    expect(cipher).not.toBe('30123456')
    // Pero al desencriptar volvemos al plaintext (round-trip funciona)
    expect(decryptSecret(cipher)).toBe('30123456')
  })

  it('update normal sin password → no toca el cipher', async () => {
    const { supabase, updateCalls } = setupSupabase()
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase })

    const res = await PATCH(
      makeReq(ID, { nombre_cuenta: 'Nuevo nombre' }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(200)
    expect(updateCalls[0].nombre_cuenta).toBe('Nuevo nombre')
    // No agregamos resumen_password_cipher si no vino en el body
    expect('resumen_password_cipher' in updateCalls[0]).toBe(false)
  })

  it('resumen_password supera el límite de 100 chars → 400', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase: setupSupabase().supabase })
    const res = await PATCH(
      makeReq(ID, { resumen_password: 'x'.repeat(101) }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(400)
  })

  it('combinar password + otros campos en el mismo PATCH', async () => {
    const { supabase, updateCalls } = setupSupabase()
    createClientMock.mockResolvedValueOnce({ user: { id: 'u1' }, supabase })

    const res = await PATCH(
      makeReq(ID, {
        nombre_cuenta: 'Visa Plat',
        terminacion_tarjeta: '1234',
        resumen_password: '30999888',
      }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(200)
    expect(updateCalls[0].nombre_cuenta).toBe('Visa Plat')
    expect(updateCalls[0].terminacion_tarjeta).toBe('1234')
    expect(decryptSecret(updateCalls[0].resumen_password_cipher as string)).toBe('30999888')
  })
})
