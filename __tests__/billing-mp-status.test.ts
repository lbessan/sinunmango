// Tests para GET /api/billing/mp/status
//
// Devuelve el estado de la suscripción para la UI de Configuración:
//   - plan, plan_period, plan_amount, plan_renews_at, plan_expires_at
//   - mp_status, has_preapproval
//   - early_access, early_access_expires_at
//   - subscribed_at
//   - last_payments (últimos 3)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { GET } from '@/app/api/billing/mp/status/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/billing/mp/status')
}

type SetupOpts = {
  user:         { id: string } | null
  profile?:     unknown
  profileErr?:  unknown
  payments?:    unknown[]
}

function setupSupabase(opts: SetupOpts) {
  const profileMaybeSingle = vi.fn(() => Promise.resolve({
    data: opts.profile ?? null, error: opts.profileErr ?? null,
  }))
  const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }))
  const profileSelect = vi.fn(() => ({ eq: profileEq }))

  const paymentsLimit = vi.fn(() => Promise.resolve({ data: opts.payments ?? [], error: null }))
  const paymentsOrder = vi.fn(() => ({ limit: paymentsLimit }))
  const paymentsSelect = vi.fn(() => ({ order: paymentsOrder }))

  const from = vi.fn((table: string) => {
    if (table === 'user_profiles') return { select: profileSelect }
    if (table === 'payments')      return { select: paymentsSelect }
    throw new Error(`Tabla inesperada: ${table}`)
  })
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('GET /api/billing/mp/status — auth', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })
})

describe('GET /api/billing/mp/status — defaults para user sin suscripción', () => {
  it('devuelve plan=free + todos los campos null/false cuando no hay profile', async () => {
    setupSupabase({ user: { id: 'u' }, profile: null, payments: [] })
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.plan).toBe('free')
    expect(body.plan_period).toBeNull()
    expect(body.plan_amount).toBeNull()
    expect(body.plan_renews_at).toBeNull()
    expect(body.plan_expires_at).toBeNull()
    expect(body.mp_status).toBeNull()
    expect(body.has_preapproval).toBe(false)
    expect(body.early_access).toBe(false)
    expect(body.early_access_expires_at).toBeNull()
    expect(body.subscribed_at).toBeNull()
    expect(body.last_payments).toEqual([])
  })
})

describe('GET /api/billing/mp/status — user con suscripción', () => {
  it('refleja todos los campos del profile correctamente', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: {
        plan:                    'pro',
        plan_period:             'monthly',
        plan_amount:             3499,
        plan_renews_at:          '2026-06-01T00:00:00Z',
        plan_expires_at:         '2026-06-15T00:00:00Z',
        mp_status:               'authorized',
        mp_preapproval_id:       'preapp-X',
        early_access:            true,
        early_access_expires_at: '2027-05-01T00:00:00Z',
        subscribed_at:           '2026-05-01T00:00:00Z',
      },
      payments: [],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.plan).toBe('pro')
    expect(body.plan_period).toBe('monthly')
    expect(body.plan_amount).toBe(3499)
    expect(body.plan_renews_at).toBe('2026-06-01T00:00:00Z')
    expect(body.plan_expires_at).toBe('2026-06-15T00:00:00Z')
    expect(body.mp_status).toBe('authorized')
    expect(body.has_preapproval).toBe(true)
    expect(body.early_access).toBe(true)
    expect(body.early_access_expires_at).toBe('2027-05-01T00:00:00Z')
    expect(body.subscribed_at).toBe('2026-05-01T00:00:00Z')
  })

  it('has_preapproval=true cuando mp_preapproval_id está seteado', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'free', mp_preapproval_id: 'preapp-X' },
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.has_preapproval).toBe(true)
  })

  it('has_preapproval=false cuando mp_preapproval_id es null', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'free', mp_preapproval_id: null },
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.has_preapproval).toBe(false)
  })
})

describe('GET /api/billing/mp/status — payments', () => {
  it('devuelve los últimos payments (más recientes primero)', async () => {
    const payments = [
      { mp_payment_id: '3', amount: 3499, currency: 'ARS', status: 'approved', status_detail: 'ok', created_at: '2026-05-15T00:00:00Z' },
      { mp_payment_id: '2', amount: 3499, currency: 'ARS', status: 'approved', status_detail: 'ok', created_at: '2026-04-15T00:00:00Z' },
      { mp_payment_id: '1', amount: 3499, currency: 'ARS', status: 'approved', status_detail: 'ok', created_at: '2026-03-15T00:00:00Z' },
    ]
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'pro', mp_preapproval_id: 'p' },
      payments,
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.last_payments).toEqual(payments)
  })

  it('last_payments=[] si no hay payments', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: { plan: 'pro', mp_preapproval_id: 'p' },
      payments: [],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.last_payments).toEqual([])
  })
})

describe('GET /api/billing/mp/status — error handling', () => {
  it('500 si query de profile tira error', async () => {
    setupSupabase({
      user: { id: 'u' },
      profileErr: { message: 'db down' },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('No pudimos leer')
    consoleErr.mockRestore()
  })
})
