// Tests para POST /api/shares/[id]/regenerate
//
// Cubre:
//   - 401 sin auth
//   - 404 si el share no existe / no es del owner
//   - 400 si está revocado
//   - 400 si ya fue aceptado (no tiene sentido regenerar)
//   - 200 happy path: genera nuevo token + nuevo expires_at + devuelve url

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { POST } from '@/app/api/shares/[id]/regenerate/route'

type Resp = { data: unknown; error: unknown }
function buildSupabase(opts: {
  share?:        Record<string, unknown> | null
  updateError?:  unknown
}) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: opts.share ?? null, error: null } as Resp))
  const updateCalls: Array<Record<string, unknown>> = []
  const eqChain = {
    eq:          vi.fn(function (this: unknown) { return this }),
    maybeSingle,
    then:        (cb: (v: { error: unknown }) => unknown) =>
                   Promise.resolve({ error: opts.updateError ?? null }).then(cb),
  }
  Object.setPrototypeOf(eqChain, { eq: eqChain.eq, maybeSingle, then: eqChain.then })

  const update = vi.fn((row: Record<string, unknown>) => {
    updateCalls.push(row)
    return eqChain
  })

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => eqChain),
        update,
      })),
    },
    updateCalls,
  }
}

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/shares/${id}/regenerate`, { method: 'POST' })
}

const ME = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  createClientMock.mockReset()
})

describe('POST /api/shares/[id]/regenerate', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await POST(makeReq('s1'), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(401)
  })

  it('404 si no existe / no del owner', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({ share: null }).supabase,
    })
    const res = await POST(makeReq('s1'), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(404)
  })

  it('400 si está revocado', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        share: { id: 's1', accepted_at: null, revoked_at: '2026-05-01' },
      }).supabase,
    })
    const res = await POST(makeReq('s1'), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/revocado/i)
  })

  it('400 si ya fue aceptado (no tiene sentido regenerar)', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        share: { id: 's1', accepted_at: '2026-05-10', revoked_at: null },
      }).supabase,
    })
    const res = await POST(makeReq('s1'), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/aceptado/i)
  })

  it('happy path: nuevo token + nuevo expires_at + invite_url', async () => {
    const { supabase, updateCalls } = buildSupabase({
      share: { id: 's1', accepted_at: null, revoked_at: null },
    })
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase })

    const res = await POST(makeReq('s1'), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Token formato hex de 32 chars
    expect(body.invite_token).toMatch(/^[a-f0-9]{32}$/)
    expect(body.invite_url).toContain('/invite/')
    expect(body.invite_url).toContain(body.invite_token)
    // expires_at debe ser en el futuro
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now())

    // El update se hizo con un cipher token + nueva fecha
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].invite_token).toBe(body.invite_token)
    expect(updateCalls[0].expires_at).toBe(body.expires_at)
  })
})
