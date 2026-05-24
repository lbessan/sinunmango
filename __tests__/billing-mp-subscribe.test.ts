// Tests para POST /api/billing/mp/subscribe
//
// Cubrimos:
//   - Auth: 401 sin user
//   - 404 si no hay profile
//   - 409 si ya tiene suscripción activa (mp_status authorized/pending)
//   - Early access: aplica si quedan slots (< 100), no si está full
//   - payerEmail: usa MP_SANDBOX_TEST_BUYER_EMAIL en sandbox, email real en prod
//   - Body del response correcto (init_point, preapproval_id, plan_amount, etc.)
//   - Errores de MP: 502 con mp_status/mp_body en sandbox, mensaje genérico en prod
//   - Errores inesperados: 500
//   - Side effects: update de user_profiles con campos correctos

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MercadoPagoError } from '@/lib/mercadopago'

// ── Mocks hoisted ──────────────────────────────────────────────────────────
const { createClientMock, adminFromMock, mpCreateMock, mpCheckoutUrlMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  adminFromMock:    vi.fn(),
  mpCreateMock:     vi.fn(),
  mpCheckoutUrlMock: vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

vi.mock('@/lib/mercadopago', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mercadopago')>('@/lib/mercadopago')
  return {
    ...actual,
    createPreapproval:      mpCreateMock,
    preapprovalCheckoutUrl: mpCheckoutUrlMock,
  }
})

import { POST } from '@/app/api/billing/mp/subscribe/route'

// ── Helpers ────────────────────────────────────────────────────────────────
function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/billing/mp/subscribe', { method: 'POST' })
}

function setUser(user: { id: string; email?: string } | null) {
  const profileMaybeSingle = vi.fn()
  const profileSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profileMaybeSingle })) }))
  const from = vi.fn(() => ({ select: profileSelect }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user })
  return { profileMaybeSingle, from }
}

function setAdminCount(count: number | null) {
  const eqFn = vi.fn(() => Promise.resolve({ count, data: null, error: null }))
  const selectFn = vi.fn(() => ({ eq: eqFn }))
  adminFromMock.mockReturnValueOnce({ select: selectFn })
  return { selectFn, eqFn }
}

function setAdminUpdate(result: { error?: unknown; data?: unknown[] } = {}) {
  const select = vi.fn(() => Promise.resolve({ data: result.data ?? [{ user_id: 'u1' }], error: result.error ?? null }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  adminFromMock.mockReturnValueOnce({ update })
  return { update, eq, select }
}

beforeEach(() => {
  createClientMock.mockReset()
  adminFromMock.mockReset()
  mpCreateMock.mockReset()
  mpCheckoutUrlMock.mockReset()

  process.env.MP_ACCESS_TOKEN = 'TEST-tok'
  process.env.APP_URL = 'https://app.example.com'
  delete process.env.MP_MODE
  delete process.env.MP_SANDBOX_TEST_BUYER_EMAIL
})

// ── Auth ───────────────────────────────────────────────────────────────────
describe('POST /api/billing/mp/subscribe — auth', () => {
  it('401 si no hay user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })
})

// ── Validaciones de perfil ─────────────────────────────────────────────────
describe('POST /api/billing/mp/subscribe — validaciones', () => {
  it('404 si no existe profile del user', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await POST(makeReq())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Perfil no encontrado')
  })

  it('409 si mp_status=authorized (ya tiene suscripción activa)', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: 'p1', mp_status: 'authorized', plan: 'pro', email: 'a@b.com' },
      error: null,
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Ya tenés una suscripción activa')
    expect(body.current_status).toBe('authorized')
  })

  it('409 si mp_status=pending (en medio de un flow)', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: 'p1', mp_status: 'pending', plan: 'free', email: 'a@b.com' },
      error: null,
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.current_status).toBe('pending')
  })

  it('permite resuscribir si mp_status=paused', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: 'p1', mp_status: 'paused', plan: 'pro', email: 'a@b.com' },
      error: null,
    })
    setAdminCount(50)
    setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'new-p', status: 'pending', init_point: 'https://mp.com/checkout-prod',
      sandbox_init_point: 'https://mp.com/checkout-sbx',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 3499, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('https://mp.com/checkout-sbx')

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
  })

  it('permite resuscribir si mp_status=cancelled', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: 'p1', mp_status: 'cancelled', plan: 'free', email: 'a@b.com' },
      error: null,
    })
    setAdminCount(50)
    setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'p-new', status: 'pending', init_point: 'p',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 3499, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('p')

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
  })

  it('permite suscribir si mp_status=null (nunca se suscribió)', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: 'a@b.com' },
      error: null,
    })
    setAdminCount(0)
    setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'p1', status: 'pending', init_point: 'i',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 3499, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('i')

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
  })
})

// ── Early Access logic ─────────────────────────────────────────────────────
describe('POST /api/billing/mp/subscribe — early access', () => {
  function setupHappyPath(emailUser: string, earlyCount: number) {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: emailUser })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: emailUser },
      error: null,
    })
    setAdminCount(earlyCount)
    setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'p1', status: 'pending', init_point: 'i',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: earlyCount < 100 ? 3499 : 6999, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('checkout-url')
  }

  it('0 suscriptores early → este es el #1 → precio $3499 (early)', async () => {
    setupHappyPath('a@b.com', 0)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.early_access).toBe(true)
    expect(body.plan_amount).toBe(3499)
    expect(mpCreateMock.mock.calls[0][0].amountArs).toBe(3499)
  })

  it('99 suscriptores early → este es el #100 → todavía early', async () => {
    setupHappyPath('a@b.com', 99)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.early_access).toBe(true)
    expect(body.plan_amount).toBe(3499)
  })

  it('100 suscriptores early → cupo lleno → precio standard $6999', async () => {
    setupHappyPath('a@b.com', 100)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.early_access).toBe(false)
    expect(body.plan_amount).toBe(6999)
    expect(mpCreateMock.mock.calls[0][0].amountArs).toBe(6999)
  })

  it('150 suscriptores early (más del límite) → standard', async () => {
    setupHappyPath('a@b.com', 150)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.early_access).toBe(false)
    expect(body.plan_amount).toBe(6999)
  })

  it('count=null (DB raro) → trata como 0 → early', async () => {
    setupHappyPath('a@b.com', null as never)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.early_access).toBe(true)
  })

  it('reason del preapproval menciona early access cuando aplica', async () => {
    setupHappyPath('a@b.com', 50)
    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].reason).toContain('Early Access')
  })

  it('reason del preapproval NO menciona early cuando no aplica', async () => {
    setupHappyPath('a@b.com', 100)
    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].reason).not.toContain('Early Access')
  })
})

// ── Sandbox / payerEmail ───────────────────────────────────────────────────
describe('POST /api/billing/mp/subscribe — sandbox payerEmail', () => {
  function setupHappyPath(emailUser: string) {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: emailUser })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: emailUser },
      error: null,
    })
    setAdminCount(0)
    setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'p1', status: 'pending', init_point: 'i', sandbox_init_point: 's',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 3499, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('checkout')
  }

  it('sandbox (MP_MODE=sandbox) + MP_SANDBOX_TEST_BUYER_EMAIL → usa el de sandbox', async () => {
    process.env.MP_MODE = 'sandbox'
    process.env.MP_SANDBOX_TEST_BUYER_EMAIL = 'test_user@testuser.com'
    setupHappyPath('real@user.com')

    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].payerEmail).toBe('test_user@testuser.com')
  })

  it('sandbox sin MP_SANDBOX_TEST_BUYER_EMAIL → usa el real del user', async () => {
    process.env.MP_MODE = 'sandbox'
    delete process.env.MP_SANDBOX_TEST_BUYER_EMAIL
    setupHappyPath('real@user.com')

    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].payerEmail).toBe('real@user.com')
  })

  it('production NUNCA usa MP_SANDBOX_TEST_BUYER_EMAIL aunque esté seteado', async () => {
    process.env.MP_MODE = 'production'
    process.env.MP_ACCESS_TOKEN = 'APP_USR-prod'
    process.env.MP_SANDBOX_TEST_BUYER_EMAIL = 'should-not-use@test.com'
    setupHappyPath('real@user.com')

    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].payerEmail).toBe('real@user.com')
  })

  it('token TEST- sin MP_MODE explícito → detecta como sandbox', async () => {
    delete process.env.MP_MODE
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
    process.env.MP_SANDBOX_TEST_BUYER_EMAIL = 'test_buyer@x.com'
    setupHappyPath('real@user.com')

    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].payerEmail).toBe('test_buyer@x.com')
  })

  it('token APP_USR- sin MP_MODE explícito → detecta como production', async () => {
    delete process.env.MP_MODE
    process.env.MP_ACCESS_TOKEN = 'APP_USR-prod-token'
    process.env.MP_SANDBOX_TEST_BUYER_EMAIL = 'should-not-use@x.com'
    setupHappyPath('real@user.com')

    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].payerEmail).toBe('real@user.com')
  })
})

// ── Manejo de errores ─────────────────────────────────────────────────────
describe('POST /api/billing/mp/subscribe — error handling', () => {
  function setupForMpError() {
    const { profileMaybeSingle } = setUser({ id: 'u1', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: 'a@b.com' },
      error: null,
    })
    setAdminCount(0)
  }

  it('MercadoPagoError → 502 en sandbox incluye mp_status + mp_body', async () => {
    process.env.MP_MODE = 'sandbox'
    setupForMpError()
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mpCreateMock.mockRejectedValueOnce(new MercadoPagoError('fail', 422, 'invalid email format'))

    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('No pudimos iniciar el cobro')
    expect(body.mp_status).toBe(422)
    expect(body.mp_body).toContain('invalid email')
    consoleErr.mockRestore()
  })

  it('MercadoPagoError → 502 en production NO incluye detalles (no leak)', async () => {
    process.env.MP_MODE = 'production'
    process.env.MP_ACCESS_TOKEN = 'APP_USR-prod'
    setupForMpError()
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mpCreateMock.mockRejectedValueOnce(new MercadoPagoError('fail', 422, 'internal MP issue X'))

    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('No pudimos iniciar el cobro')
    expect(body.mp_status).toBeUndefined()
    expect(body.mp_body).toBeUndefined()
    consoleErr.mockRestore()
  })

  it('error inesperado (no MercadoPagoError) → 500', async () => {
    setupForMpError()
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mpCreateMock.mockRejectedValueOnce(new Error('boom'))

    const res = await POST(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Error inesperado')
    consoleErr.mockRestore()
  })
})

// ── Response shape + side effects ─────────────────────────────────────────
describe('POST /api/billing/mp/subscribe — happy path response', () => {
  function setup() {
    const { profileMaybeSingle } = setUser({ id: 'user-123', email: 'a@b.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: 'a@b.com' },
      error: null,
    })
    setAdminCount(10)
    const { update } = setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'preapp-X', status: 'pending', init_point: 'prod-url',
      sandbox_init_point: 'sbx-url',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 3499, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('chosen-url')
    return { update }
  }

  it('body contiene init_point, preapproval_id, plan_amount, early_access, trial_ends_at', async () => {
    setup()
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.init_point).toBe('chosen-url')
    expect(body.preapproval_id).toBe('preapp-X')
    expect(body.plan_amount).toBe(3499)
    expect(body.early_access).toBe(true)
    expect(body.trial_ends_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('externalReference del preapproval es el user_id de Supabase', async () => {
    setup()
    await POST(makeReq())
    expect(mpCreateMock.mock.calls[0][0].externalReference).toBe('user-123')
    expect(mpCreateMock.mock.calls[0][0].userId).toBe('user-123')
  })

  it('startDate del preapproval es ~7 días en el futuro', async () => {
    setup()
    await POST(makeReq())
    const startDate: Date = mpCreateMock.mock.calls[0][0].startDate
    const diff = startDate.getTime() - Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    // Tolerancia de unos segundos por la diferencia entre llamadas
    expect(Math.abs(diff - sevenDays)).toBeLessThan(5000)
  })

  it('actualiza user_profiles con mp_preapproval_id, mp_status=pending, early_access y fechas', async () => {
    const { update } = setup()
    await POST(makeReq())
    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.mp_preapproval_id).toBe('preapp-X')
    expect(updateCall.mp_status).toBe('pending')
    expect(updateCall.plan_period).toBe('monthly')
    expect(updateCall.plan_amount).toBe(3499)
    expect(updateCall.early_access).toBe(true)
    expect(updateCall.subscribed_at).toBeDefined()
    expect(updateCall.plan_renews_at).toBeDefined()
    expect(updateCall.early_access_expires_at).toBeDefined()
  })

  it('early_access_expires_at es ~12 meses en el futuro cuando aplica', async () => {
    const { update } = setup()
    await POST(makeReq())
    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    const expiresAt = new Date(updateCall.early_access_expires_at as string)
    const now = new Date()
    const diffMonths = (expiresAt.getFullYear() - now.getFullYear()) * 12
      + (expiresAt.getMonth() - now.getMonth())
    expect(diffMonths).toBe(12)
  })

  it('early_access_expires_at es null si no aplica early access', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u', email: 'x@y.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: 'x@y.com' },
      error: null,
    })
    setAdminCount(150)  // por encima del límite
    const { update } = setAdminUpdate()
    mpCreateMock.mockResolvedValueOnce({
      id: 'p', status: 'pending', init_point: 'i',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 6999, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('i')

    await POST(makeReq())
    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.early_access).toBe(false)
    expect(updateCall.early_access_expires_at).toBeNull()
  })

  it('si admin update falla, igual devuelve 200 con init_point (no bloqueamos al user)', async () => {
    const { profileMaybeSingle } = setUser({ id: 'u', email: 'x@y.com' })
    profileMaybeSingle.mockResolvedValueOnce({
      data: { mp_preapproval_id: null, mp_status: null, plan: 'free', email: 'x@y.com' },
      error: null,
    })
    setAdminCount(0)
    setAdminUpdate({ error: { message: 'db down' } })
    mpCreateMock.mockResolvedValueOnce({
      id: 'p', status: 'pending', init_point: 'i',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 3499, currency_id: 'ARS' },
    })
    mpCheckoutUrlMock.mockReturnValueOnce('i')
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })
})
