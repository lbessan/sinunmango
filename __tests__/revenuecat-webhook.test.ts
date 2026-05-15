import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock del módulo de subscription. vi.mock es hoisted, así que aplica antes
// de la import del route handler. Capturamos updateUserPlan como vi.fn() para
// poder verificar los args con los que se llamó en cada test.
vi.mock('@/lib/subscription', () => ({
  updateUserPlan: vi.fn().mockResolvedValue(undefined),
}))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/revenuecat-webhook/route'
import { updateUserPlan } from '@/lib/subscription'

const SECRET = 'test-rc-secret'
const USER_ID = '11111111-2222-3333-4444-555555555555'

beforeEach(() => {
  process.env.REVENUECAT_WEBHOOK_SECRET = SECRET
  vi.mocked(updateUserPlan).mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.REVENUECAT_WEBHOOK_SECRET
})

function makeReq(body: unknown, opts: { auth?: string | null } = {}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (opts.auth !== null) headers.set('authorization', opts.auth ?? `Bearer ${SECRET}`)
  return new NextRequest('http://localhost/api/revenuecat-webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// ── Auth ────────────────────────────────────────────────────────────────────
describe('revenuecat-webhook — auth', () => {
  it('sin REVENUECAT_WEBHOOK_SECRET configurado → 503', async () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET
    const res = await POST(makeReq({ event: { type: 'INITIAL_PURCHASE' } }))
    expect(res.status).toBe(503)
  })

  it('sin header Authorization → 401', async () => {
    const res = await POST(makeReq({ event: { type: 'INITIAL_PURCHASE' } }, { auth: null }))
    expect(res.status).toBe(401)
  })

  it('Bearer incorrecto → 401', async () => {
    const res = await POST(makeReq({ event: { type: 'INITIAL_PURCHASE' } }, { auth: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })

  it('autorizado con secret correcto + body vacío → 400 (invalid JSON)', async () => {
    const res = await POST(makeReq(''))
    expect(res.status).toBe(400)
  })

  it('autorizado pero body sin event → 400', async () => {
    const res = await POST(makeReq({ no_event: true }))
    expect(res.status).toBe(400)
  })

  it('autorizado pero event sin app_user_id → 200 skipped, sin updateUserPlan', async () => {
    const res = await POST(makeReq({ event: { type: 'INITIAL_PURCHASE' } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('no_user_id')
    expect(updateUserPlan).not.toHaveBeenCalled()
  })
})

// ── Activación: INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE / UNCANCELLATION ──
describe('revenuecat-webhook — eventos que otorgan Pro', () => {
  const PRO_EVENT_TYPES = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION']

  for (const type of PRO_EVENT_TYPES) {
    it(`${type} → updateUserPlan('pro') con expires_at, transaction_id y product_id`, async () => {
      const expiresMs = Date.UTC(2026, 11, 31, 0, 0, 0)
      const res = await POST(makeReq({
        event: {
          type,
          app_user_id:        USER_ID,
          expiration_at_ms:   expiresMs,
          transaction_id:     'tx-123',
          product_id:         'pro_monthly',
        },
      }))
      expect(res.status).toBe(200)
      expect(updateUserPlan).toHaveBeenCalledExactlyOnceWith(USER_ID, 'pro', {
        plan_expires_at:        new Date(expiresMs).toISOString(),
        google_purchase_token:  'tx-123',
        google_subscription_id: 'pro_monthly',
      })
    })
  }

  it('INITIAL_PURCHASE sin expiration_at_ms → expires_at=null (Pro lifetime)', async () => {
    await POST(makeReq({
      event: { type: 'INITIAL_PURCHASE', app_user_id: USER_ID },
    }))
    expect(updateUserPlan).toHaveBeenCalledWith(USER_ID, 'pro', {
      plan_expires_at:        null,
      google_purchase_token:  null,
      google_subscription_id: null,
    })
  })
})

// ── CANCELLATION ─────────────────────────────────────────────────────────────
describe('revenuecat-webhook — CANCELLATION', () => {
  it('con expiration_at_ms → mantiene pro con nuevo expires_at', async () => {
    const expiresMs = Date.UTC(2026, 11, 31)
    await POST(makeReq({
      event: { type: 'CANCELLATION', app_user_id: USER_ID, expiration_at_ms: expiresMs, product_id: 'p1' },
    }))
    expect(updateUserPlan).toHaveBeenCalledExactlyOnceWith(USER_ID, 'pro', {
      plan_expires_at:        new Date(expiresMs).toISOString(),
      google_subscription_id: 'p1',
    })
  })

  it('sin expiration_at_ms → NO llama updateUserPlan (mantiene el estado actual)', async () => {
    await POST(makeReq({
      event: { type: 'CANCELLATION', app_user_id: USER_ID },
    }))
    expect(updateUserPlan).not.toHaveBeenCalled()
  })
})

// ── Pérdida de acceso: EXPIRATION / BILLING_ISSUE ────────────────────────────
describe('revenuecat-webhook — eventos que degradan a Free', () => {
  for (const type of ['EXPIRATION', 'BILLING_ISSUE']) {
    it(`${type} → updateUserPlan('free') con todo null`, async () => {
      const res = await POST(makeReq({
        event: { type, app_user_id: USER_ID, transaction_id: 'tx', product_id: 'p' },
      }))
      expect(res.status).toBe(200)
      expect(updateUserPlan).toHaveBeenCalledExactlyOnceWith(USER_ID, 'free', {
        plan_expires_at:        null,
        google_purchase_token:  null,
        google_subscription_id: null,
      })
    })
  }
})

// ── Eventos ignorados ────────────────────────────────────────────────────────
describe('revenuecat-webhook — eventos ignorados', () => {
  for (const type of ['SUBSCRIBER_ALIAS', 'TRANSFER', 'NON_RENEWING_PURCHASE', 'WEIRD_EVENT']) {
    it(`${type} → 200 ok sin tocar updateUserPlan`, async () => {
      const res = await POST(makeReq({
        event: { type, app_user_id: USER_ID },
      }))
      expect(res.status).toBe(200)
      expect(updateUserPlan).not.toHaveBeenCalled()
    })
  }
})

// ── Errores en updateUserPlan ────────────────────────────────────────────────
describe('revenuecat-webhook — errores de updateUserPlan', () => {
  it('si updateUserPlan tira error → 500 (RC reintenta)', async () => {
    vi.mocked(updateUserPlan).mockRejectedValueOnce(new Error('DB down'))
    const res = await POST(makeReq({
      event: { type: 'INITIAL_PURCHASE', app_user_id: USER_ID },
    }))
    expect(res.status).toBe(500)
  })
})

// ── Sandbox: se procesa pero loggea diferencia ───────────────────────────────
describe('revenuecat-webhook — environment SANDBOX', () => {
  it('SANDBOX event se procesa igual que PRODUCTION', async () => {
    await POST(makeReq({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: USER_ID,
        expiration_at_ms: 9999999999999,
        environment: 'SANDBOX',
      },
    }))
    expect(updateUserPlan).toHaveBeenCalledOnce()
  })
})
