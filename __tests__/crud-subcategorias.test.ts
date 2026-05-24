// Tests para POST /api/subcategorias

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

import { POST } from '@/app/api/subcategorias/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/subcategorias', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function supaSuccess() {
  const single = vi.fn(() => Promise.resolve({ data: { id: 'subcat_xxx' }, error: null }))
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const from = vi.fn(() => ({ insert }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
  return { insert }
}

beforeEach(() => createClientMock.mockReset())

describe('POST /api/subcategorias', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req({ nombre_subcategoria: 'X' }))
    expect(res.status).toBe(401)
  })

  it('400 si falta nombre_subcategoria', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('400 si nombre_subcategoria > 50 chars', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ nombre_subcategoria: 'x'.repeat(51) }))
    expect(res.status).toBe(400)
  })

  it('happy path sin categoria_padre', async () => {
    const { insert } = supaSuccess()
    const res = await POST(req({ nombre_subcategoria: 'Súper rapidito' }))
    expect(res.status).toBe(201)
    const inserted = insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.categoria_padre).toBeNull()
  })

  it('happy path con categoria_padre válida', async () => {
    const { insert } = supaSuccess()
    const res = await POST(req({
      nombre_subcategoria: 'X',
      categoria_padre: 'cat_abc',
    }))
    expect(res.status).toBe(201)
    const inserted = insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.categoria_padre).toBe('cat_abc')
  })
})
