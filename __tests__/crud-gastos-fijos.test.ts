// Tests para POST /api/gastos-fijos

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

import { POST } from '@/app/api/gastos-fijos/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/gastos-fijos', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function supaSuccess() {
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn(() => ({ insert }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
  return { insert }
}

beforeEach(() => createClientMock.mockReset())

const VALID = {
  nombre_gasto:        'Netflix',
  monto_estimado:      5000,
  moneda:              'ARS',
  dia_vencimiento:     10,
}

describe('POST /api/gastos-fijos', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req(VALID))
    expect(res.status).toBe(401)
  })

  it('400 si falta nombre_gasto', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, nombre_gasto: undefined }))
    expect(res.status).toBe(400)
  })

  it('400 si monto_estimado es 0', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, monto_estimado: 0 }))
    expect(res.status).toBe(400)
  })

  it('400 si moneda no es ARS|USD', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, moneda: 'BTC' }))
    expect(res.status).toBe(400)
  })

  it('happy path: 200', async () => {
    supaSuccess()
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
  })

  it('user_id seteado server-side', async () => {
    const { insert } = supaSuccess()
    await POST(req({ ...VALID, user_id: 'attacker' }))
    const inserted = insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.user_id).toBe('u1')
  })
})
