// Tests para GET + POST /api/user-preferences

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

// El endpoint usa PATCH para upsert (no POST como el resto de CRUD)
import { GET, PATCH } from '@/app/api/user-preferences/route'

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/user-preferences', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => createClientMock.mockReset())

describe('GET /api/user-preferences', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await GET(req('GET'))
    expect(res.status).toBe(401)
  })

  it('sin prefs row → devuelve defaults', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u' } })

    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alerta_vencimientos_activa).toBe(true)
    expect(body.alerta_vencimientos_dias).toEqual([0, 1, 3])
    expect(body.alerta_resumen_semanal).toBe(false)
    expect(body.alerta_resumen_mensual).toBe(false)
  })

  it('con prefs row → devuelve los valores del user', async () => {
    const userPrefs = {
      alerta_vencimientos_activa: false,
      alerta_vencimientos_dias:   [0],
      alerta_resumen_semanal:     true,
      alerta_resumen_mensual:     true,
    }
    const maybeSingle = vi.fn(() => Promise.resolve({ data: userPrefs, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u' } })

    const res = await GET(req('GET'))
    const body = await res.json()
    expect(body).toEqual(userPrefs)
  })

  it('500 si query falla', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u' } })

    const res = await GET(req('GET'))
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/user-preferences', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await PATCH(req('PATCH', { alerta_resumen_semanal: true }))
    expect(res.status).toBe(401)
  })

  it('upsert con user_id seteado server-side', async () => {
    const single = vi.fn(() => Promise.resolve({ data: { alerta_resumen_semanal: true }, error: null }))
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'user-1' } })

    const res = await PATCH(req('PATCH', { alerta_resumen_semanal: true, user_id: 'attacker' }))
    expect(res.status).toBe(200)

    const upsertArgs = upsert.mock.calls[0][0] as Record<string, unknown>
    expect(upsertArgs.user_id).toBe('user-1')  // del session, no del body
    expect(upsertArgs.alerta_resumen_semanal).toBe(true)
    expect(upsertArgs.updated_at).toBeDefined()
  })

  it('500 si upsert falla', async () => {
    const single = vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } }))
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u' } })

    const res = await PATCH(req('PATCH', {}))
    expect(res.status).toBe(500)
  })
})
