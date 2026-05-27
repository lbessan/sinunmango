// Tests para POST /api/webhooks/mp + GET /api/webhooks/mp
//
// Lo más crítico del módulo de billing — todos los cambios de estado de la
// suscripción del user pasan por acá. Cubrimos:
//
//   - GET → siempre 200 (ping de validación de MP)
//   - POST sin body válido → 400
//   - POST sin firma válida → 401
//   - POST con resourceId ausente → 400
//   - subscription_preapproval → consulta MP, actualiza profile según status
//   - subscription_authorized_payment / payment → consulta MP, upserta payment,
//     extiende plan si approved
//   - Idempotencia: misma firma + mismo id no duplica state (igual upserta)
//   - type desconocido → ignora silently
//   - Errores procesando → no devuelve 500 (no queremos retry del lado de MP)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

const { adminFromMock, mpGetPreapproval, mpGetPayment } = vi.hoisted(() => ({
  adminFromMock:    vi.fn(),
  mpGetPreapproval: vi.fn(),
  mpGetPayment:     vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

vi.mock('@/lib/mercadopago', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mercadopago')>('@/lib/mercadopago')
  return {
    ...actual,
    getPreapproval: mpGetPreapproval,
    getPayment:     mpGetPayment,
  }
})

import { GET, POST } from '@/app/api/webhooks/mp/route'

// Helper: firma un webhook como MP. El secret debe coincidir con
// MP_WEBHOOK_SECRET en process.env para que verifyWebhookSignature pase.
function sign(opts: { secret: string; ts: string; resourceId: string; requestId: string }): string {
  const manifest = `id:${opts.resourceId};request-id:${opts.requestId};ts:${opts.ts};`
  const v1 = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return `ts=${opts.ts},v1=${v1}`
}

function makeReq(opts: {
  body:        unknown
  signature?:  string | null
  requestId?:  string | null
}): NextRequest {
  const headers = new Headers()
  if (opts.signature !== null) headers.set('x-signature', opts.signature ?? '')
  if (opts.requestId !== null) headers.set('x-request-id', opts.requestId ?? '')
  return new NextRequest('http://localhost/api/webhooks/mp', {
    method: 'POST',
    headers,
    body:   typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  })
}

beforeEach(() => {
  adminFromMock.mockReset()
  mpGetPreapproval.mockReset()
  mpGetPayment.mockReset()
  process.env.MP_WEBHOOK_SECRET = 'test-secret'
  process.env.MP_ACCESS_TOKEN = 'TEST-tok'
  delete process.env.MP_MODE
})

// ── GET ────────────────────────────────────────────────────────────────────
describe('GET /api/webhooks/mp', () => {
  it('200 con { ok: true } (ping de MP)', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ── POST: bad input ────────────────────────────────────────────────────────
describe('POST /api/webhooks/mp — input inválido', () => {
  it('400 si el body no es JSON parseable', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = new NextRequest('http://localhost/api/webhooks/mp', {
      method: 'POST',
      body:   'not valid json {',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('bad json')
    consoleWarn.mockRestore()
  })

  it('400 si no hay resource id en el body (ni data.id ni id)', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = makeReq({
      body: { type: 'payment' },  // sin data.id
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing id')
    consoleWarn.mockRestore()
  })

  it('acepta resource id en root como fallback de data.id', async () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = 'req-1'
    const resourceId = 'res-x'
    const signature = sign({ secret: 's', ts, resourceId, requestId })

    mpGetPreapproval.mockResolvedValueOnce({
      id: resourceId, status: 'pending', external_reference: null,
    })
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    adminFromMock.mockReturnValueOnce({ update })

    const req = makeReq({
      body: { type: 'subscription_preapproval', id: resourceId },
      signature, requestId,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})

// ── POST: firma ────────────────────────────────────────────────────────────
describe('POST /api/webhooks/mp — firma', () => {
  it('401 si la firma no matchea', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = makeReq({
      body: { type: 'payment', data: { id: '123' } },
      signature: 'ts=1,v1=deadbeef',
      requestId: 'req-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid signature')
    consoleWarn.mockRestore()
  })

  it('401 si falta x-signature', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = makeReq({
      body: { type: 'payment', data: { id: '123' } },
      signature: null,
      requestId: 'req-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })

  it('401 si falta x-request-id', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = makeReq({
      body: { type: 'payment', data: { id: '123' } },
      signature: 'ts=1,v1=abc',
      requestId: null,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })
})

// ── POST: subscription_preapproval handler ─────────────────────────────────
describe('POST /api/webhooks/mp — type=subscription_preapproval', () => {
  function setupSignedReq(opts: {
    preapprovalId: string
    type?:         string
  }) {
    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = 'req-1'
    const signature = sign({
      secret: process.env.MP_WEBHOOK_SECRET!, ts,
      resourceId: opts.preapprovalId, requestId,
    })
    return makeReq({
      body: { type: opts.type ?? 'subscription_preapproval', data: { id: opts.preapprovalId } },
      signature, requestId,
    })
  }

  it('preapproval autorizado → plan=pro, plan_expires_at=next_payment_date', async () => {
    mpGetPreapproval.mockResolvedValueOnce({
      id: 'p1', status: 'authorized',
      external_reference: 'user-uuid',
      next_payment_date: '2026-06-15T00:00:00Z',
    })
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    adminFromMock.mockReturnValueOnce({ update })

    const res = await POST(setupSignedReq({ preapprovalId: 'p1' }))
    expect(res.status).toBe(200)

    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.mp_status).toBe('authorized')
    expect(updateCall.plan).toBe('pro')
    expect(updateCall.plan_renews_at).toBe('2026-06-15T00:00:00Z')
    expect(updateCall.plan_expires_at).toBe('2026-06-15T00:00:00Z')
    expect(updateEq).toHaveBeenCalledWith('user_id', 'user-uuid')
  })

  it('preapproval paused → mp_status=paused, NO toca plan', async () => {
    mpGetPreapproval.mockResolvedValueOnce({
      id: 'p1', status: 'paused',
      external_reference: 'user-uuid',
      next_payment_date: '2026-07-01T00:00:00Z',
    })
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    adminFromMock.mockReturnValueOnce({ update })

    await POST(setupSignedReq({ preapprovalId: 'p1' }))
    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.mp_status).toBe('paused')
    expect(updateCall.plan).toBeUndefined()
    expect(updateCall.plan_renews_at).toBe('2026-07-01T00:00:00Z')
  })

  it('preapproval cancelled → mp_status=cancelled, NO toca plan', async () => {
    mpGetPreapproval.mockResolvedValueOnce({
      id: 'p1', status: 'cancelled',
      external_reference: 'user-uuid',
    })
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    adminFromMock.mockReturnValueOnce({ update })

    await POST(setupSignedReq({ preapprovalId: 'p1' }))
    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.mp_status).toBe('cancelled')
    expect(updateCall.plan).toBeUndefined()
  })

  it('sin external_reference → busca por mp_preapproval_id como fallback', async () => {
    mpGetPreapproval.mockResolvedValueOnce({
      id: 'preapp-fallback', status: 'authorized', external_reference: null,
      next_payment_date: '2026-06-01T00:00:00Z',
    })
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    adminFromMock.mockReturnValueOnce({ update })

    await POST(setupSignedReq({ preapprovalId: 'preapp-fallback' }))
    expect(updateEq).toHaveBeenCalledWith('mp_preapproval_id', 'preapp-fallback')
  })

  it('si admin update tira error → loggea pero devuelve 200', async () => {
    mpGetPreapproval.mockResolvedValueOnce({
      id: 'p1', status: 'authorized', external_reference: 'u',
    })
    const updateEq = vi.fn(() => Promise.resolve({ error: { message: 'db down' } }))
    const update = vi.fn(() => ({ eq: updateEq }))
    adminFromMock.mockReturnValueOnce({ update })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(setupSignedReq({ preapprovalId: 'p1' }))
    expect(res.status).toBe(200)
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })
})

// ── POST: payment handler ─────────────────────────────────────────────────
describe('POST /api/webhooks/mp — type=payment', () => {
  function setupSignedReq(paymentId: string, type: 'payment' | 'subscription_authorized_payment' = 'payment') {
    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = 'req-pay'
    const signature = sign({
      secret: process.env.MP_WEBHOOK_SECRET!, ts,
      resourceId: paymentId, requestId,
    })
    return makeReq({
      body: { type, data: { id: paymentId } },
      signature, requestId,
    })
  }

  it('payment approved + external_reference → upsert payment + extiende plan a +1 mes', async () => {
    mpGetPayment.mockResolvedValueOnce({
      id: 99, status: 'approved', status_detail: 'accredited',
      transaction_amount: 3499, currency_id: 'ARS',
      date_created: '2026-05-24T10:00:00Z',
      payer: { id: 555, email: 'x@y.com' },
      external_reference: 'user-uuid',
      metadata: { preapproval_id: 'preapp-X' },
    })
    const paymentsUpsert = vi.fn(() => Promise.resolve({ error: null }))
    const profileEq = vi.fn(() => Promise.resolve({ error: null }))
    const profileUpdate = vi.fn(() => ({ eq: profileEq }))
    adminFromMock
      .mockReturnValueOnce({ upsert: paymentsUpsert })  // payments
      .mockReturnValueOnce({ update: profileUpdate })  // user_profiles

    const res = await POST(setupSignedReq('99'))
    expect(res.status).toBe(200)

    // Payments upsert
    expect(paymentsUpsert).toHaveBeenCalledTimes(1)
    const [insertedPayment, upsertOpts] = paymentsUpsert.mock.calls[0]
    expect(insertedPayment.user_id).toBe('user-uuid')
    expect(insertedPayment.mp_payment_id).toBe('99')
    expect(insertedPayment.mp_preapproval_id).toBe('preapp-X')
    expect(insertedPayment.amount).toBe(3499)
    expect(insertedPayment.currency).toBe('ARS')
    expect(insertedPayment.status).toBe('approved')
    expect(insertedPayment.status_detail).toBe('accredited')
    expect(upsertOpts).toEqual({ onConflict: 'mp_payment_id' })

    // Profile update
    const profileUpdateCall = profileUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(profileUpdateCall.plan).toBe('pro')
    expect(profileUpdateCall.mp_status).toBe('authorized')
    expect(profileUpdateCall.mp_payer_id).toBe('555')

    // plan_expires_at ≈ NOW() + 1 mes
    const expiresAt = new Date(profileUpdateCall.plan_expires_at as string)
    const oneMonthFromNow = new Date()
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1)
    expect(Math.abs(expiresAt.getTime() - oneMonthFromNow.getTime())).toBeLessThan(5000)
  })

  it('payment rejected → upsert payment pero NO extiende plan', async () => {
    mpGetPayment.mockResolvedValueOnce({
      id: 99, status: 'rejected', status_detail: 'cc_rejected',
      transaction_amount: 3499, currency_id: 'ARS',
      date_created: '2026-05-24T10:00:00Z',
      payer: {},
      external_reference: 'user-uuid',
    })
    const paymentsUpsert = vi.fn(() => Promise.resolve({ error: null }))
    adminFromMock.mockReturnValueOnce({ upsert: paymentsUpsert })

    await POST(setupSignedReq('99'))
    expect(paymentsUpsert).toHaveBeenCalledTimes(1)
    // Solo se llamó from() una vez (payments), no profile update
    expect(adminFromMock).toHaveBeenCalledTimes(1)
  })

  it('payment sin user_id ni preapproval_id → skipea (no procesa)', async () => {
    mpGetPayment.mockResolvedValueOnce({
      id: 99, status: 'approved', status_detail: 'ok',
      transaction_amount: 3499, currency_id: 'ARS',
      date_created: 'x',
      payer: {},
      external_reference: null,
      // metadata sin preapproval_id
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await POST(setupSignedReq('99'))
    expect(res.status).toBe(200)
    expect(adminFromMock).not.toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('payment approved sin external_reference pero CON preapproval_id → upserta usando preapproval id como fallback', async () => {
    mpGetPayment.mockResolvedValueOnce({
      id: 99, status: 'approved', status_detail: 'ok',
      transaction_amount: 3499, currency_id: 'ARS',
      date_created: 'x',
      payer: {},
      external_reference: null,
      metadata: { preapproval_id: 'preapp-Y' },
    })
    const profileEq = vi.fn(() => Promise.resolve({ error: null }))
    const profileUpdate = vi.fn(() => ({ eq: profileEq }))
    adminFromMock.mockReturnValueOnce({ update: profileUpdate })

    const res = await POST(setupSignedReq('99'))
    expect(res.status).toBe(200)
    // El upsert NO se hace cuando no hay userId (solo profile update por preapproval_id)
    expect(profileEq).toHaveBeenCalledWith('mp_preapproval_id', 'preapp-Y')
  })

  it('type=subscription_authorized_payment se procesa igual que type=payment', async () => {
    mpGetPayment.mockResolvedValueOnce({
      id: 99, status: 'approved', status_detail: 'ok',
      transaction_amount: 3499, currency_id: 'ARS',
      date_created: 'x',
      payer: { id: 1 },
      external_reference: 'u',
      metadata: { preapproval_id: 'p' },
    })
    const paymentsUpsert = vi.fn(() => Promise.resolve({ error: null }))
    const profileEq = vi.fn(() => Promise.resolve({ error: null }))
    const profileUpdate = vi.fn(() => ({ eq: profileEq }))
    adminFromMock
      .mockReturnValueOnce({ upsert: paymentsUpsert })
      .mockReturnValueOnce({ update: profileUpdate })

    const res = await POST(setupSignedReq('99', 'subscription_authorized_payment'))
    expect(res.status).toBe(200)
    expect(mpGetPayment).toHaveBeenCalled()
    expect(paymentsUpsert).toHaveBeenCalled()
  })

  it('si upsert de payments falla → loggea pero sigue', async () => {
    mpGetPayment.mockResolvedValueOnce({
      id: 99, status: 'rejected', status_detail: 'fail',
      transaction_amount: 1, currency_id: 'ARS',
      date_created: 'x', payer: {},
      external_reference: 'u',
    })
    const paymentsUpsert = vi.fn(() => Promise.resolve({ error: { message: 'db' } }))
    adminFromMock.mockReturnValueOnce({ upsert: paymentsUpsert })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(setupSignedReq('99'))
    expect(res.status).toBe(200)
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })
})

// ── POST: type desconocido ─────────────────────────────────────────────────
describe('POST /api/webhooks/mp — type desconocido', () => {
  it('type=test → 200, no toca DB, log info', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = 'req-1'
    const resourceId = 'rid'
    const signature = sign({
      secret: process.env.MP_WEBHOOK_SECRET!, ts, resourceId, requestId,
    })
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await POST(makeReq({
      body: { type: 'test', data: { id: resourceId } },
      signature, requestId,
    }))
    expect(res.status).toBe(200)
    expect(adminFromMock).not.toHaveBeenCalled()
    consoleLog.mockRestore()
  })

  it('type ausente → 200, ignora silenciosamente', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = 'req-1'
    const resourceId = 'rid'
    const signature = sign({
      secret: process.env.MP_WEBHOOK_SECRET!, ts, resourceId, requestId,
    })
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await POST(makeReq({
      body: { data: { id: resourceId } },
      signature, requestId,
    }))
    expect(res.status).toBe(200)
    consoleLog.mockRestore()
  })
})

// ── POST: error procesando ────────────────────────────────────────────────
describe('POST /api/webhooks/mp — errores procesando', () => {
  it('error en getPreapproval → 200 (logueado, MP no reintenta)', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = 'req-1'
    const resourceId = 'p1'
    const signature = sign({
      secret: process.env.MP_WEBHOOK_SECRET!, ts, resourceId, requestId,
    })
    mpGetPreapproval.mockRejectedValueOnce(new Error('MP timeout'))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq({
      body: { type: 'subscription_preapproval', data: { id: resourceId } },
      signature, requestId,
    }))
    expect(res.status).toBe(200)
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })
})
