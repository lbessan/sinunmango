// Tests para POST /api/bancos-custom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

import { POST } from '@/app/api/bancos-custom/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/bancos-custom', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function supaSuccess() {
  const single = vi.fn(() => Promise.resolve({ data: { id: 'b-1' }, error: null }))
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const from = vi.fn(() => ({ insert }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
}

beforeEach(() => createClientMock.mockReset())

describe('POST /api/bancos-custom', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req({ nombre: 'Mi Banco' }))
    expect(res.status).toBe(401)
  })

  it('400 si falta nombre', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('400 si nombre > 50 chars', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ nombre: 'x'.repeat(51) }))
    expect(res.status).toBe(400)
  })

  it('400 si color no es hex válido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ nombre: 'X', color: 'rojo' }))
    expect(res.status).toBe(400)
  })

  it('happy path con tipo=banco', async () => {
    supaSuccess()
    const res = await POST(req({ nombre: 'Mi Banco', tipo: 'banco' }))
    expect(res.status).toBe(200)
  })

  it('happy path con tipo=billetera', async () => {
    supaSuccess()
    const res = await POST(req({ nombre: 'Mi Billetera', tipo: 'billetera' }))
    expect(res.status).toBe(200)
  })

  it('happy path con tipo=crypto', async () => {
    supaSuccess()
    const res = await POST(req({ nombre: 'Mi Wallet', tipo: 'crypto' }))
    expect(res.status).toBe(200)
  })
})
