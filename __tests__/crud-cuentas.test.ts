// Tests para /api/cuentas/* (POST/PATCH/DELETE)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST }                       from '@/app/api/cuentas/route'
import { PATCH, DELETE }              from '@/app/api/cuentas/[id]/route'

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cuentas', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function supaSuccess(): void {
  // POST insert path: from('cuentas').insert({...}) → { error: null }
  // PATCH path: from('cuentas').update({...}).eq().eq() → { error: null }
  // DELETE path: from('cuentas').update().eq().eq().neq() → { error: null }
  const neq = vi.fn(() => Promise.resolve({ error: null }))
  const eq2 = vi.fn(() => ({ neq, then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb) }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const update = vi.fn(() => ({ eq: eq1 }))
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn(() => ({ insert, update }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
}

beforeEach(() => createClientMock.mockReset())

const VALID = {
  nombre_cuenta: 'Galicia CA',
  moneda: 'ARS',
  tipo_cuenta: 'Banco CA',
  saldo_inicial: 10000,
}

describe('POST /api/cuentas', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(401)
  })

  it('400 si body no es JSON', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const r = new NextRequest('http://localhost/api/cuentas', { method: 'POST', body: 'xxx' })
    const res = await POST(r)
    expect(res.status).toBe(400)
  })

  it('400 si falta nombre_cuenta', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req('POST', { ...VALID, nombre_cuenta: undefined }))
    expect(res.status).toBe(400)
  })

  it('400 si moneda no es ARS|USD', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req('POST', { ...VALID, moneda: 'EUR' }))
    expect(res.status).toBe(400)
  })

  it('400 si tipo_cuenta no es válido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req('POST', { ...VALID, tipo_cuenta: 'NoExiste' }))
    expect(res.status).toBe(400)
  })

  it('400 si terminacion_tarjeta no es 4 dígitos', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req('POST', { ...VALID, terminacion_tarjeta: '123' }))
    expect(res.status).toBe(400)
  })

  it('happy path: 200 con id devuelto', async () => {
    supaSuccess()
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.id).toBeDefined()
  })
})

describe('PATCH /api/cuentas/[id]', () => {
  const ctx = { params: Promise.resolve({ id: 'cta-1' }) }

  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await PATCH(req('PATCH', { nombre_cuenta: 'X' }), ctx)
    expect(res.status).toBe(401)
  })

  it('400 si body sin campos para actualizar', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await PATCH(req('PATCH', {}), ctx)
    expect(res.status).toBe(400)
  })

  it('400 si color_primario no es hex válido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await PATCH(req('PATCH', { color_primario: 'red' }), ctx)
    expect(res.status).toBe(400)
  })

  it('happy path: 200', async () => {
    supaSuccess()
    const res = await PATCH(req('PATCH', { nombre_cuenta: 'Renombrada' }), ctx)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/cuentas/[id]', () => {
  const ctx = { params: Promise.resolve({ id: 'cta-1' }) }

  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await DELETE(req('DELETE'), ctx)
    expect(res.status).toBe(401)
  })

  it('happy path: 200 (soft delete activa=false)', async () => {
    supaSuccess()
    const res = await DELETE(req('DELETE'), ctx)
    expect(res.status).toBe(200)
  })
})
