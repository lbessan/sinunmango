// Tests para GET /api/me (info user + plan + usage)
//
// Cubrimos:
//   - 401 sin auth
//   - Free: devuelve usage por feature
//   - Pro: devuelve usage=null (ilimitado)
//   - Plan expirado degrada a sin acceso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { USAGE_LIMITS_FREE } from '@/lib/usage-limits'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { GET } from '@/app/api/me/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/me')
}

function setupSupabase(opts: {
  user:    { id: string; email?: string } | null
  profile?: unknown
  usage?:   Array<{ feature: string; count: number }>
}) {
  // getUserPlan llama .from('user_profiles').select(...).maybeSingle()
  // (sin .eq() — confía en RLS). El de /api/me también usa el cliente para
  // rpc('get_all_usage'). Cubrimos ambos patterns.
  const profileMaybeSingle = vi.fn(() => Promise.resolve({ data: opts.profile ?? null, error: null }))
  const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }))
  const profileSelect = vi.fn(() => ({ eq: profileEq, maybeSingle: profileMaybeSingle }))
  const from = vi.fn(() => ({ select: profileSelect }))
  const rpc = vi.fn(() => Promise.resolve({ data: opts.usage ?? [], error: null }))
  const supabase = { from, rpc }
  createClientMock.mockResolvedValueOnce({ supabase, user: opts.user })
  return { rpc, from }
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('GET /api/me', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('Free sin profile → defaults a free + usage en 0', async () => {
    setupSupabase({
      user: { id: 'u', email: 'u@e.com' },
      profile: null,
      usage: [],
    })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('u')
    expect(body.email).toBe('u@e.com')
    expect(body.plan).toBe('free')
    expect(body.has_pro_access).toBe(false)
    expect(body.plan_expires_at).toBeNull()
    expect(body.usage).toEqual({
      asistente:    { used: 0, limit: USAGE_LIMITS_FREE.asistente,    remaining: USAGE_LIMITS_FREE.asistente },
      ticket:       { used: 0, limit: USAGE_LIMITS_FREE.ticket,       remaining: USAGE_LIMITS_FREE.ticket },
      resumen:      { used: 0, limit: USAGE_LIMITS_FREE.resumen,      remaining: USAGE_LIMITS_FREE.resumen },
      mail_tarjeta: { used: 0, limit: USAGE_LIMITS_FREE.mail_tarjeta, remaining: USAGE_LIMITS_FREE.mail_tarjeta },
    })
  })

  it('Free con uso parcial → usage refleja consumo por feature', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'free', plan_expires_at: null },
      usage: [
        { feature: 'asistente', count: 5 },
        { feature: 'ticket',    count: 1 },
      ],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.usage.asistente.used).toBe(5)
    expect(body.usage.asistente.remaining).toBe(USAGE_LIMITS_FREE.asistente - 5)
    expect(body.usage.ticket.used).toBe(1)
    expect(body.usage.ticket.remaining).toBe(USAGE_LIMITS_FREE.ticket - 1)
    expect(body.usage.resumen.used).toBe(0)
    expect(body.usage.mail_tarjeta.used).toBe(0)
  })

  it('Free con uso > limit → remaining=0 (no negativo)', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'free', plan_expires_at: null },
      usage: [{ feature: 'asistente', count: 9999 }],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.usage.asistente.remaining).toBe(0)
  })

  it('Pro con expiración futura → has_pro_access=true, usage=null (no consulta RPC)', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { rpc } = setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'pro', plan_expires_at: future },
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.plan).toBe('pro')
    expect(body.has_pro_access).toBe(true)
    expect(body.usage).toBeNull()
    // Optimización: si es Pro no llamamos a la RPC de usage
    expect(rpc).not.toHaveBeenCalled()
  })

  it('Pro vencido → plan=pro pero has_pro_access=false, devuelve usage (Free fallback)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'pro', plan_expires_at: past },
      usage: [],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.plan).toBe('pro')
    expect(body.has_pro_access).toBe(false)
    // Sin acceso Pro → tratado como Free → usage es objeto
    expect(body.usage).not.toBeNull()
  })

  it('Grandfathered → has_pro_access=true incluso con plan_expires_at pasado', async () => {
    const past = '2020-01-01T00:00:00Z'
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'grandfathered', plan_expires_at: past },
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.has_pro_access).toBe(true)
    expect(body.usage).toBeNull()
  })

  it('Body incluye id y email del user', async () => {
    setupSupabase({
      user: { id: 'unique-id', email: 'unique@test.com' },
      profile: null,
      usage: [],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.id).toBe('unique-id')
    expect(body.email).toBe('unique@test.com')
  })
})
