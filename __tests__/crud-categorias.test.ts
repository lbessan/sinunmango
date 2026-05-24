// Tests para POST /api/categorias

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

import { POST } from '@/app/api/categorias/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/categorias', {
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

describe('POST /api/categorias', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req({ nombre_categoria: 'X' }))
    expect(res.status).toBe(401)
  })

  it('400 si JSON inválido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const r = new NextRequest('http://localhost/api/categorias', { method: 'POST', body: 'xxx' })
    const res = await POST(r)
    expect(res.status).toBe(400)
  })

  it('400 si falta nombre_categoria', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('400 si nombre_categoria > 50 chars', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ nombre_categoria: 'x'.repeat(51) }))
    expect(res.status).toBe(400)
  })

  it('400 si tipo_default no es Gasto|Ingreso|Transferencia', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ nombre_categoria: 'X', tipo_default: 'Otro' }))
    expect(res.status).toBe(400)
  })

  it('happy path: 200', async () => {
    const { insert } = supaSuccess()
    const res = await POST(req({ nombre_categoria: 'Súper', tipo_default: 'Gasto' }))
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalled()
  })

  it('tipo_default default a Gasto si no se manda', async () => {
    const { insert } = supaSuccess()
    await POST(req({ nombre_categoria: 'X' }))
    const inserted = insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.tipo_default).toBe('Gasto')
  })
})
