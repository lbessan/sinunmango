// Tests para lib/mercadopago.ts
//
// El módulo encapsula la integración con MP. Cubrimos:
//   - Constantes de pricing (single source of truth)
//   - mpMode() y detección sandbox vs production (lectura de env)
//   - preapprovalCheckoutUrl() — qué URL elegir según el modo
//   - mpFetch wrapper — armado de URL, headers, manejo de errores, x-request-id
//   - createPreapproval / getPreapproval / pausePreapproval / cancelPreapproval
//   - getPayment
//   - verifyWebhookSignature — la pieza más crítica (es la barrera de seguridad
//     del webhook). Constructamos firmas reales con HMAC-SHA256 y validamos.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'
import {
  PRO_PRICE_ARS,
  EARLY_ACCESS_PRICE_ARS,
  EARLY_ACCESS_LIMIT,
  EARLY_ACCESS_DURATION_MONTHS,
  TRIAL_DAYS,
  MercadoPagoError,
  preapprovalCheckoutUrl,
  createPreapproval,
  getPreapproval,
  pausePreapproval,
  cancelPreapproval,
  getPayment,
  verifyWebhookSignature,
  type MpPreapproval,
} from '@/lib/mercadopago'

// Helper: monta un fetch mock que devuelve un body JSON. opts.status puede
// ser 4xx/5xx para probar el error path.
function mockFetch(opts: {
  body:       unknown
  status?:    number
  requestId?: string
}) {
  const status = opts.status ?? 200
  const requestId = opts.requestId ?? 'req-abc-123'
  const headers = new Headers({ 'x-request-id': requestId })

  const fn = vi.fn(async () => {
    if (status >= 200 && status < 300) {
      return new Response(JSON.stringify(opts.body), { status, headers })
    }
    // Error path: el wrapper llama res.text(), no res.json()
    return new Response(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body), {
      status,
      headers,
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  // Defaults seguros — cada test puede sobreescribir si necesita
  process.env.MP_ACCESS_TOKEN = 'TEST-default-token'
  process.env.APP_URL = 'https://app.example.com'
  delete process.env.MP_MODE
  delete process.env.MP_WEBHOOK_SECRET
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── Constantes de pricing ─────────────────────────────────────────────────
//
// Estos números viven en producción. Si alguien los cambia accidentalmente,
// estos tests fallan y avisan que el commit afecta el modelo de pricing.
describe('constantes de pricing', () => {
  it('PRO_PRICE_ARS = 6999', () => {
    expect(PRO_PRICE_ARS).toBe(6999)
  })

  it('EARLY_ACCESS_PRICE_ARS = 3499 (50% off de PRO_PRICE_ARS, aprox)', () => {
    expect(EARLY_ACCESS_PRICE_ARS).toBe(3499)
    // Sanity check: el descuento es ~50%
    const discount = 1 - (EARLY_ACCESS_PRICE_ARS / PRO_PRICE_ARS)
    expect(discount).toBeGreaterThan(0.49)
    expect(discount).toBeLessThan(0.51)
  })

  it('EARLY_ACCESS_LIMIT = 100 suscriptores', () => {
    expect(EARLY_ACCESS_LIMIT).toBe(100)
  })

  it('EARLY_ACCESS_DURATION_MONTHS = 12', () => {
    expect(EARLY_ACCESS_DURATION_MONTHS).toBe(12)
  })

  it('TRIAL_DAYS = 7 (alineado con la copy de la landing)', () => {
    expect(TRIAL_DAYS).toBe(7)
  })
})

// ── preapprovalCheckoutUrl ────────────────────────────────────────────────
//
// La función decide qué URL devolver según el modo. En sandbox, MP requiere
// usar sandbox_init_point porque init_point redirige a "gestionar" en lugar
// del checkout cuando el token es de testing.
describe('preapprovalCheckoutUrl', () => {
  const basePreapproval: MpPreapproval = {
    id: 'preapp-1',
    status: 'pending',
    init_point: 'https://www.mercadopago.com.ar/checkout/prod',
    sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/sbx',
    auto_recurring: {
      frequency: 1, frequency_type: 'months',
      transaction_amount: 6999, currency_id: 'ARS',
    },
  }

  it('sandbox + sandbox_init_point presente → devuelve la sandbox URL', () => {
    process.env.MP_MODE = 'sandbox'
    expect(preapprovalCheckoutUrl(basePreapproval)).toBe(basePreapproval.sandbox_init_point)
  })

  it('sandbox sin sandbox_init_point → cae a init_point', () => {
    process.env.MP_MODE = 'sandbox'
    const p = { ...basePreapproval, sandbox_init_point: undefined }
    expect(preapprovalCheckoutUrl(p)).toBe(basePreapproval.init_point)
  })

  it('production → siempre init_point aunque haya sandbox_init_point', () => {
    process.env.MP_MODE = 'production'
    expect(preapprovalCheckoutUrl(basePreapproval)).toBe(basePreapproval.init_point)
  })

  it('sin MP_MODE explícito, token TEST- → modo sandbox → sandbox URL', () => {
    delete process.env.MP_MODE
    process.env.MP_ACCESS_TOKEN = 'TEST-abc'
    expect(preapprovalCheckoutUrl(basePreapproval)).toBe(basePreapproval.sandbox_init_point)
  })

  it('sin MP_MODE explícito, token APP_USR- → modo production → init_point', () => {
    delete process.env.MP_MODE
    process.env.MP_ACCESS_TOKEN = 'APP_USR-xyz'
    expect(preapprovalCheckoutUrl(basePreapproval)).toBe(basePreapproval.init_point)
  })

  it('MP_MODE en mayúsculas (PRODUCTION) → reconocido (case-insensitive)', () => {
    process.env.MP_MODE = 'PRODUCTION'
    expect(preapprovalCheckoutUrl(basePreapproval)).toBe(basePreapproval.init_point)
  })

  it('MP_MODE valor inválido → cae a detección por prefix', () => {
    process.env.MP_MODE = 'foo'
    process.env.MP_ACCESS_TOKEN = 'TEST-fallback'
    expect(preapprovalCheckoutUrl(basePreapproval)).toBe(basePreapproval.sandbox_init_point)
  })
})

// ── createPreapproval ──────────────────────────────────────────────────────
describe('createPreapproval', () => {
  it('POST a /preapproval con body correcto y headers de auth', async () => {
    const fakeResp: MpPreapproval = {
      id: 'preapp-x',
      status: 'pending',
      init_point: 'https://www.mercadopago.com.ar/checkout/x',
      auto_recurring: {
        frequency: 1, frequency_type: 'months',
        transaction_amount: 6999, currency_id: 'ARS',
      },
    }
    const fetchFn = mockFetch({ body: fakeResp })

    const startDate = new Date('2026-06-01T12:00:00.500Z')
    const r = await createPreapproval({
      userId:            'user-123',
      payerEmail:        'test@example.com',
      amountArs:         6999,
      reason:            'sinunmango Pro',
      startDate,
      externalReference: 'user-123',
    })

    expect(r).toEqual(fakeResp)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.mercadopago.com/preapproval')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer TEST-default-token')
    expect(headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init?.body as string)
    expect(body.payer_email).toBe('test@example.com')
    expect(body.external_reference).toBe('user-123')
    expect(body.reason).toBe('sinunmango Pro')
    expect(body.status).toBe('pending')
    expect(body.back_url).toBe('https://app.example.com/checkout/result')
    expect(body.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: 'months',
      start_date: '2026-06-01T12:00:00.500Z',  // MP requiere ISO 8601 con ms
      transaction_amount: 6999,
      currency_id: 'ARS',
    })
  })

  it('start_date va con milisegundos (formato MP-friendly)', async () => {
    const startDate = new Date(Date.UTC(2026, 5, 1, 12, 30, 45, 123))
    mockFetch({ body: { id: 'x', status: 'pending', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 1, currency_id: 'ARS' } } as MpPreapproval })

    await createPreapproval({
      userId: 'u', payerEmail: 'a@b.com', amountArs: 1,
      reason: 'r', startDate, externalReference: 'u',
    })

    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    const body = JSON.parse(init!.body as string)
    // El ISO de JS siempre incluye .NNN si Date tiene ms
    expect(body.auto_recurring.start_date).toMatch(/\.\d{3}Z$/)
  })

  it('back_url normaliza trailing slash en APP_URL', async () => {
    process.env.APP_URL = 'https://app.example.com/'
    mockFetch({ body: { id: 'x', status: 'pending', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 1, currency_id: 'ARS' } } as MpPreapproval })

    await createPreapproval({
      userId: 'u', payerEmail: 'a@b.com', amountArs: 1,
      reason: 'r', startDate: new Date(), externalReference: 'u',
    })

    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    const body = JSON.parse(init!.body as string)
    expect(body.back_url).toBe('https://app.example.com/checkout/result')
  })

  it('sin APP_URL en env → tira error claro', async () => {
    delete process.env.APP_URL
    mockFetch({ body: {} })
    await expect(createPreapproval({
      userId: 'u', payerEmail: 'a@b.com', amountArs: 1,
      reason: 'r', startDate: new Date(), externalReference: 'u',
    })).rejects.toThrow('APP_URL env var no configurada')
  })

  it('sin MP_ACCESS_TOKEN → tira error claro', async () => {
    delete process.env.MP_ACCESS_TOKEN
    mockFetch({ body: {} })
    await expect(createPreapproval({
      userId: 'u', payerEmail: 'a@b.com', amountArs: 1,
      reason: 'r', startDate: new Date(), externalReference: 'u',
    })).rejects.toThrow('MP_ACCESS_TOKEN env var no configurada')
  })

  it('en sandbox loguea el request body (útil para debugging)', async () => {
    process.env.MP_MODE = 'sandbox'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFetch({ body: { id: 'x', status: 'pending', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 1, currency_id: 'ARS' } } as MpPreapproval })

    await createPreapproval({
      userId: 'u', payerEmail: 'a@b.com', amountArs: 1,
      reason: 'r', startDate: new Date(), externalReference: 'u',
    })

    expect(logSpy).toHaveBeenCalled()
    expect(logSpy.mock.calls[0][0]).toContain('[mp/preapproval]')
  })

  it('en production NO loguea el body (no leakeamos datos en prod)', async () => {
    process.env.MP_MODE = 'production'
    process.env.MP_ACCESS_TOKEN = 'APP_USR-prod-token'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFetch({ body: { id: 'x', status: 'pending', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 1, currency_id: 'ARS' } } as MpPreapproval })

    await createPreapproval({
      userId: 'u', payerEmail: 'a@b.com', amountArs: 1,
      reason: 'r', startDate: new Date(), externalReference: 'u',
    })

    expect(logSpy).not.toHaveBeenCalled()
  })
})

// ── getPreapproval ─────────────────────────────────────────────────────────
describe('getPreapproval', () => {
  it('GET a /preapproval/:id con auth', async () => {
    const fakeResp = { id: 'preapp-x', status: 'authorized', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 6999, currency_id: 'ARS' } } as MpPreapproval
    const fetchFn = mockFetch({ body: fakeResp })

    const r = await getPreapproval('preapp-x')
    expect(r).toEqual(fakeResp)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.mercadopago.com/preapproval/preapp-x')
    expect(init?.method).toBeUndefined()  // GET por defecto
    const headers = init?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer TEST-default-token')
  })

  it('404 → MercadoPagoError con status y x-request-id en el body', async () => {
    mockFetch({ body: 'Not Found', status: 404, requestId: 'req-404' })
    await expect(getPreapproval('preapp-no-existe')).rejects.toThrow(MercadoPagoError)
    try {
      await getPreapproval('preapp-no-existe')
    } catch (err) {
      expect((err as MercadoPagoError).status).toBe(404)
      expect((err as MercadoPagoError).rawBody).toContain('req-404')
    }
  })

  it('500 con body grande se trunca a 600 chars en el message', async () => {
    const bigBody = 'x'.repeat(5000)
    mockFetch({ body: bigBody, status: 500 })
    try {
      await getPreapproval('preapp-x')
      throw new Error('Debió lanzar')
    } catch (err) {
      const msg = (err as Error).message
      // El message tiene un prefijo "MP GET..." + el body truncado a 600 chars
      expect(msg.length).toBeLessThan(800)
      expect(msg).toContain('MP GET /preapproval/preapp-x failed: 500')
    }
  })
})

// ── pausePreapproval / cancelPreapproval ───────────────────────────────────
describe('pausePreapproval', () => {
  it('PUT a /preapproval/:id con status=paused', async () => {
    const fakeResp = { id: 'p', status: 'paused', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 1, currency_id: 'ARS' } } as MpPreapproval
    const fetchFn = mockFetch({ body: fakeResp })

    const r = await pausePreapproval('p')
    expect(r.status).toBe('paused')

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.mercadopago.com/preapproval/p')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'paused' })
  })
})

describe('cancelPreapproval', () => {
  it('PUT a /preapproval/:id con status=cancelled', async () => {
    const fakeResp = { id: 'p', status: 'cancelled', init_point: 'u',
      auto_recurring: { frequency: 1, frequency_type: 'months',
        transaction_amount: 1, currency_id: 'ARS' } } as MpPreapproval
    const fetchFn = mockFetch({ body: fakeResp })

    const r = await cancelPreapproval('p')
    expect(r.status).toBe('cancelled')

    const init = fetchFn.mock.calls[0][1]
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'cancelled' })
  })

  it('respeta el shape de error si MP responde 422', async () => {
    mockFetch({ body: 'invalid state', status: 422 })
    await expect(cancelPreapproval('p')).rejects.toThrow(MercadoPagoError)
  })
})

// ── getPayment ─────────────────────────────────────────────────────────────
describe('getPayment', () => {
  it('GET a /v1/payments/:id', async () => {
    const fakeResp = {
      id: 123456,
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 6999,
      currency_id: 'ARS',
      date_created: '2026-05-24T10:00:00Z',
      payer: { email: 'x@y.com' },
    }
    const fetchFn = mockFetch({ body: fakeResp })

    const r = await getPayment(123456)
    expect(r.id).toBe(123456)
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/123456')
  })

  it('acepta string como id también', async () => {
    mockFetch({ body: { id: 999, status: 'approved', status_detail: 'ok',
      transaction_amount: 1, currency_id: 'ARS', date_created: 'x', payer: {} } })
    const r = await getPayment('999')
    expect(r.id).toBe(999)
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toBe('https://api.mercadopago.com/v1/payments/999')
  })
})

// ── verifyWebhookSignature ─────────────────────────────────────────────────
//
// Esta es la barrera de seguridad del webhook. Si esto se rompe, cualquiera
// podría posté­ar al endpoint y mover suscripciones. Lo testeamos a fondo.
describe('verifyWebhookSignature', () => {
  // Helper para timestamp actual (segundos epoch). Lo usamos en TODOS los
  // tests positivos porque la función rechaza webhooks con ts > 5min de
  // antigüedad (replay protection).
  function nowTs(): string {
    return String(Math.floor(Date.now() / 1000))
  }

  // Helper para construir headers válidos (con la misma lógica que MP)
  function signedHeaders(opts: {
    secret:     string
    ts:         string
    resourceId: string
    requestId:  string
  }): { signature: string; requestId: string } {
    const manifest = `id:${opts.resourceId};request-id:${opts.requestId};ts:${opts.ts};`
    const v1 = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
    return {
      signature: `ts=${opts.ts},v1=${v1}`,
      requestId: opts.requestId,
    }
  }

  it('sin MP_WEBHOOK_SECRET en sandbox → permite (warn pero pasa)', () => {
    delete process.env.MP_WEBHOOK_SECRET
    process.env.MP_MODE = 'sandbox'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ok = verifyWebhookSignature({
      signatureHeader: 'ts=1,v1=abc',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })

    expect(ok).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('sin MP_WEBHOOK_SECRET en production → RECHAZA (no podemos validar)', () => {
    delete process.env.MP_WEBHOOK_SECRET
    process.env.MP_MODE = 'production'
    process.env.MP_ACCESS_TOKEN = 'APP_USR-prod'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const ok = verifyWebhookSignature({
      signatureHeader: 'ts=1,v1=abc',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })

    expect(ok).toBe(false)
    expect(errSpy).toHaveBeenCalled()
  })

  it('firma válida → true', () => {
    process.env.MP_WEBHOOK_SECRET = 'mi-secret-super-largo'
    const { signature, requestId } = signedHeaders({
      secret: 'mi-secret-super-largo',
      ts: nowTs(), resourceId: 'res-123', requestId: 'req-abc',
    })
    const ok = verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: requestId,
      resourceId: 'res-123',
    })
    expect(ok).toBe(true)
  })

  it('firma con secret distinto → false', () => {
    process.env.MP_WEBHOOK_SECRET = 'el-secret-real'
    const { signature, requestId } = signedHeaders({
      secret: 'OTRO-secret',
      ts: nowTs(), resourceId: 'res-123', requestId: 'req-abc',
    })
    const ok = verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: requestId,
      resourceId: 'res-123',
    })
    expect(ok).toBe(false)
  })

  it('firma con resourceId distinto → false (no se puede replayar de otro recurso)', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    const { signature, requestId } = signedHeaders({
      secret: 's',
      ts: nowTs(), resourceId: 'res-A', requestId: 'req-abc',
    })
    const ok = verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: requestId,
      resourceId: 'res-B',  // ← distinto
    })
    expect(ok).toBe(false)
  })

  it('firma con requestId distinto → false', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    const { signature } = signedHeaders({
      secret: 's',
      ts: nowTs(), resourceId: 'r', requestId: 'req-A',
    })
    const ok = verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: 'req-B',  // ← distinto
      resourceId: 'r',
    })
    expect(ok).toBe(false)
  })

  it('signatureHeader null → false', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyWebhookSignature({
      signatureHeader: null,
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  it('requestIdHeader null → false', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyWebhookSignature({
      signatureHeader: 'ts=1,v1=abc',
      requestIdHeader: null,
      resourceId: 'r',
    })).toBe(false)
  })

  it('signatureHeader sin ts → false', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    expect(verifyWebhookSignature({
      signatureHeader: 'v1=abc',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  it('signatureHeader sin v1 → false', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    expect(verifyWebhookSignature({
      signatureHeader: 'ts=1',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  it('signatureHeader con formato basura → false', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    expect(verifyWebhookSignature({
      signatureHeader: 'garbage-no-equals',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  it('v1 con hex inválido → false (no tira excepción)', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyWebhookSignature({
      signatureHeader: `ts=${nowTs()},v1=NOT-HEX-ZZZZ`,
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  it('v1 con longitud distinta a la expected → false (timingSafeEqual tira)', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 32 chars hex = 16 bytes; el hmac-sha256 produce 64 chars hex = 32 bytes
    expect(verifyWebhookSignature({
      signatureHeader: `ts=${nowTs()},v1=` + 'a'.repeat(32),
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  // ── Replay protection ────────────────────────────────────────────────
  it('ts mayor a 5min en el pasado → false (replay protection)', () => {
    process.env.MP_WEBHOOK_SECRET = 'mi-secret'
    const oldTs = String(Math.floor(Date.now() / 1000) - 600)  // hace 10 min
    const { signature, requestId } = signedHeaders({
      secret: 'mi-secret', ts: oldTs, resourceId: 'r', requestId: 'req-1',
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: requestId,
      resourceId: 'r',
    })
    expect(ok).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('fuera de ventana'))
  })

  it('ts dentro de los 5min → true (firma válida con ts reciente)', () => {
    process.env.MP_WEBHOOK_SECRET = 'mi-secret'
    const recentTs = String(Math.floor(Date.now() / 1000) - 120)  // hace 2min
    const { signature, requestId } = signedHeaders({
      secret: 'mi-secret', ts: recentTs, resourceId: 'r', requestId: 'req-1',
    })
    expect(verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: requestId,
      resourceId: 'r',
    })).toBe(true)
  })

  it('ts muy en el futuro (>60s) → false', () => {
    process.env.MP_WEBHOOK_SECRET = 'mi-secret'
    const futureTs = String(Math.floor(Date.now() / 1000) + 600)  // +10min
    const { signature, requestId } = signedHeaders({
      secret: 'mi-secret', ts: futureTs, resourceId: 'r', requestId: 'req-1',
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyWebhookSignature({
      signatureHeader: signature,
      requestIdHeader: requestId,
      resourceId: 'r',
    })).toBe(false)
  })

  it('ts no numérico → false', () => {
    process.env.MP_WEBHOOK_SECRET = 'mi-secret'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyWebhookSignature({
      signatureHeader: 'ts=NOTANUMBER,v1=abc',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(false)
  })

  it('MP_WEBHOOK_SECRET vacío en sandbox → permite (mismo comportamiento que ausente)', () => {
    process.env.MP_WEBHOOK_SECRET = ''
    process.env.MP_MODE = 'sandbox'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyWebhookSignature({
      signatureHeader: 'ts=1,v1=abc',
      requestIdHeader: 'req-1',
      resourceId: 'r',
    })).toBe(true)
  })

  it('whitespace alrededor de ts/v1 se tolera', () => {
    process.env.MP_WEBHOOK_SECRET = 's'
    const { signature, requestId } = signedHeaders({
      secret: 's',
      ts: nowTs(), resourceId: 'r', requestId: 'req-1',
    })
    // Reemplazo "v1=" por "v1= " (espacio) — debería trimearse
    const withSpaces = signature.replace('v1=', 'v1= ').replace('ts=', 'ts= ')
    expect(verifyWebhookSignature({
      signatureHeader: withSpaces,
      requestIdHeader: requestId,
      resourceId: 'r',
    })).toBe(true)
  })
})

// ── MercadoPagoError ───────────────────────────────────────────────────────
describe('MercadoPagoError', () => {
  it('extiende Error, tiene name correcto y guarda status + rawBody', () => {
    const err = new MercadoPagoError('msg', 422, 'body')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('MercadoPagoError')
    expect(err.message).toBe('msg')
    expect(err.status).toBe(422)
    expect(err.rawBody).toBe('body')
  })
})
