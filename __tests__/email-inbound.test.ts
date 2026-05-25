// Tests para POST /api/email-inbound (webhook de Resend)
//
// Cubrimos los gates de entrada (los más críticos en términos de seguridad):
//   - JSON parsing (400)
//   - Detección de webhook Resend (requiere firma Svix)
//   - Sin RESEND_WEBHOOK_SECRET → 503 (endpoint deshabilitado)
//   - Sin headers Svix → 401
//   - Firma Svix inválida → 401
//   - Replay protection: timestamp fuera de ±5 min → 401
//   - Token desconocido en el "to" → skipped (no procesa)
//
// No testeamos la integración con Claude ni la inserción de movimientos —
// eso requiere un test de integración con muchos mocks.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

const { adminFromMock } = vi.hoisted(() => ({ adminFromMock: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

import { POST } from '@/app/api/email-inbound/route'

// Helper: construye los headers Svix válidos para un body dado.
// Resend usa Svix internamente: HMAC-SHA256 sobre `${id}.${ts}.${body}`,
// donde la key es el secret decodificado de base64 (whsec_<base64>).
function signSvix(opts: {
  id:        string
  timestamp: string
  body:      string
  secret:    string  // whsec_<base64>
}): string {
  const secretMatch = opts.secret.match(/^whsec_(.+)$/)!
  const secretBytes = Buffer.from(secretMatch[1], 'base64')
  const signedPayload = `${opts.id}.${opts.timestamp}.${opts.body}`
  const sig = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64')
  return `v1,${sig}`
}

function makeReq(opts: {
  body:        unknown
  svixId?:     string
  svixTs?:     string
  svixSig?:    string
}): NextRequest {
  const headers = new Headers()
  if (opts.svixId)  headers.set('svix-id', opts.svixId)
  if (opts.svixTs)  headers.set('svix-timestamp', opts.svixTs)
  if (opts.svixSig) headers.set('svix-signature', opts.svixSig)
  return new NextRequest('http://localhost/api/email-inbound', {
    method: 'POST',
    headers,
    body:   typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  })
}

// Helper: secret en formato whsec_<base64>
function whsecSecret(): string {
  const raw = Buffer.from('this-is-the-real-secret-bytes-32').toString('base64')
  return `whsec_${raw}`
}

beforeEach(() => {
  adminFromMock.mockReset()
  // Por default sin token reconocido
  adminFromMock.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  })
  process.env.RESEND_WEBHOOK_SECRET = whsecSecret()
})

afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET
})

describe('POST /api/email-inbound — JSON parsing', () => {
  it('400 si el body es JSON inválido', async () => {
    const req = makeReq({ body: 'not valid json {' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid JSON')
  })
})

describe('POST /api/email-inbound — verificación Svix', () => {
  it('503 sin RESEND_WEBHOOK_SECRET configurado (endpoint deshabilitado)', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const req = makeReq({
      body: { object: 'email', id: 'em_1', to: 'x@y.com' },
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    consoleErr.mockRestore()
  })

  it('401 si faltan los headers Svix', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = makeReq({
      body: { object: 'email', id: 'em_1', to: 'x@y.com' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })

  it('401 si la firma Svix es inválida', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ts = Math.floor(Date.now() / 1000).toString()
    const req = makeReq({
      body:    { object: 'email', id: 'em_1', to: 'x@y.com' },
      svixId:  'msg_1',
      svixTs:  ts,
      svixSig: 'v1,wrongsignature',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })

  it('401 si timestamp fuera de ±5min (replay protection)', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const oldTs = (Math.floor(Date.now() / 1000) - 10 * 60).toString()  // 10 min atrás
    const body = JSON.stringify({ object: 'email', id: 'em_1', to: 'x@y.com' })
    const sig = signSvix({
      id: 'msg_1', timestamp: oldTs, body, secret: whsecSecret(),
    })

    const req = makeReq({
      body, svixId: 'msg_1', svixTs: oldTs, svixSig: sig,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })

  it('401 si timestamp es NaN', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = JSON.stringify({ object: 'email', id: 'em_1', to: 'x@y.com' })

    const req = makeReq({
      body, svixId: 'msg_1', svixTs: 'not-a-number', svixSig: 'v1,whatever',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })

  it('firma válida + timestamp dentro de ventana → pasa al token lookup', async () => {
    const ts = Math.floor(Date.now() / 1000).toString()
    const bodyObj = { object: 'email', id: 'em_1', to: 'unknown@sinunmango.com.ar' }
    const body = JSON.stringify(bodyObj)
    const sig = signSvix({
      id: 'msg_1', timestamp: ts, body, secret: whsecSecret(),
    })

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const req = makeReq({
      body, svixId: 'msg_1', svixTs: ts, svixSig: sig,
    })
    const res = await POST(req)
    // Pasa la firma; falla en token lookup (no existe el token "unknown")
    expect(res.status).toBe(200)
    const respBody = await res.json()
    expect(respBody.ok).toBe(false)
    expect(respBody.skipped).toBe(true)
    expect(respBody.reason).toBe('unknown token')

    consoleWarn.mockRestore()
  })

  it('formato de secret distinto a whsec_<base64> → rechaza (no permite shortcut)', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'no-prefix-secret'
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ts = Math.floor(Date.now() / 1000).toString()
    const req = makeReq({
      body:    { object: 'email', id: 'em_1', to: 'x@y.com' },
      svixId:  'msg_1', svixTs: ts, svixSig: 'v1,whatever',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleErr.mockRestore()
    consoleWarn.mockRestore()
  })

  it('signature header sin v1, prefix → no matchea', async () => {
    const ts = Math.floor(Date.now() / 1000).toString()
    const bodyObj = { object: 'email', id: 'em_1', to: 'x@y.com' }
    const body = JSON.stringify(bodyObj)
    // Construyo una firma "v2,..." que no debería matchear
    const secretMatch = whsecSecret().match(/^whsec_(.+)$/)!
    const secretBytes = Buffer.from(secretMatch[1], 'base64')
    const sigBase = crypto.createHmac('sha256', secretBytes).update(`msg_1.${ts}.${body}`).digest('base64')
    const sigV2only = `v2,${sigBase}`

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const req = makeReq({
      body, svixId: 'msg_1', svixTs: ts, svixSig: sigV2only,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    consoleWarn.mockRestore()
  })
})

describe('POST /api/email-inbound — token lookup', () => {
  function signedReq(body: unknown): NextRequest {
    const ts = Math.floor(Date.now() / 1000).toString()
    const bodyStr = JSON.stringify(body)
    const sig = signSvix({ id: 'msg_1', timestamp: ts, body: bodyStr, secret: whsecSecret() })
    return makeReq({ body: bodyStr, svixId: 'msg_1', svixTs: ts, svixSig: sig })
  }

  it('to address sin domain conocido → skipped no matching to address', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.EMAIL_INBOUND_DOMAIN = 'sinunmango.com.ar'
    // El "to" es array vacío
    const res = await POST(signedReq({ object: 'email', id: 'em_1', to: [] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('no matching to address')
    consoleWarn.mockRestore()
    delete process.env.EMAIL_INBOUND_DOMAIN
  })

  it('token no existe en DB → skipped unknown token', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await POST(signedReq({
      object: 'email', id: 'em_1', to: 'unknown-token@sinunmango.com.ar',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('unknown token')
    consoleWarn.mockRestore()
  })
})

// ── Auto-delete del email después de procesar ─────────────────────────────
//
// Privacy: después de cada decisión terminal (excepto error de DB) llamamos
// DELETE /emails/receiving/{id} para que no quede el body en el dashboard
// de Resend. Tests verifican el call al endpoint Resend con method=DELETE.
describe('POST /api/email-inbound — auto-delete tras procesar', () => {
  function signedReq(body: unknown): NextRequest {
    const ts = Math.floor(Date.now() / 1000).toString()
    const bodyStr = JSON.stringify(body)
    const sig = signSvix({ id: 'msg_1', timestamp: ts, body: bodyStr, secret: whsecSecret() })
    return makeReq({ body: bodyStr, svixId: 'msg_1', svixTs: ts, svixSig: sig })
  }

  // Helper: intercept fetch a Resend API. Devuelve el spy para verificar calls.
  function setupFetchSpy(opts: { deleteStatus?: number } = {}) {
    const fetchSpy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('api.resend.com') && init?.method === 'DELETE') {
        return new Response('', { status: opts.deleteStatus ?? 200 })
      }
      // Default: respuesta vacía para evitar errores
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    return fetchSpy
  }

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'rk_test_123'
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_KEEP_INBOUND
    vi.unstubAllGlobals()
  })

  it('unknown token → DELETE al endpoint Resend con emailId correcto', async () => {
    const fetchSpy = setupFetchSpy()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await POST(signedReq({
      object: 'email', id: 'em_unknown_123', to: 'unknown@sinunmango.com.ar',
    }))

    // El primer call (o algún call) tuvo que ser un DELETE a Resend con el emailId
    const deleteCalls = fetchSpy.mock.calls.filter(c =>
      typeof c[0] === 'string' &&
      c[0].includes('/emails/receiving/em_unknown_123') &&
      (c[1] as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(1)

    // Auth header
    const headers = (deleteCalls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer rk_test_123')

    consoleWarn.mockRestore()
  })

  it('sin RESEND_API_KEY → no llama DELETE (no-op)', async () => {
    delete process.env.RESEND_API_KEY
    const fetchSpy = setupFetchSpy()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await POST(signedReq({
      object: 'email', id: 'em_1', to: 'unknown@sinunmango.com.ar',
    }))

    const deleteCalls = fetchSpy.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('api.resend.com') &&
      (c[1] as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(0)

    consoleWarn.mockRestore()
  })

  it('RESEND_KEEP_INBOUND=true (sandbox/dev) → NO borra (devs pueden inspeccionar)', async () => {
    process.env.RESEND_KEEP_INBOUND = 'true'
    const fetchSpy = setupFetchSpy()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    await POST(signedReq({
      object: 'email', id: 'em_dev', to: 'unknown@sinunmango.com.ar',
    }))

    const deleteCalls = fetchSpy.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('api.resend.com') &&
      (c[1] as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(0)

    consoleWarn.mockRestore()
    consoleLog.mockRestore()
  })

  it('DELETE devuelve 404 (ya borrado) → NO loguea warning (se trata como éxito)', async () => {
    const fetchSpy = setupFetchSpy({ deleteStatus: 404 })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    await POST(signedReq({
      object: 'email', id: 'em_1', to: 'unknown@sinunmango.com.ar',
    }))

    // 404 lo tratamos como éxito (ya estaba borrado)
    // Buscar que NO haya un warn sobre "Resend DELETE"
    const deleteWarnings = consoleWarn.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('Resend DELETE')
    )
    expect(deleteWarnings.length).toBe(0)

    expect(fetchSpy).toHaveBeenCalled()
    consoleWarn.mockRestore()
    consoleLog.mockRestore()
  })

  it('DELETE devuelve 500 → loguea warning pero NO crashea', async () => {
    const fetchSpy = setupFetchSpy({ deleteStatus: 500 })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await POST(signedReq({
      object: 'email', id: 'em_1', to: 'unknown@sinunmango.com.ar',
    }))

    // El response se devuelve normal (best-effort): no propagamos el error
    expect(res.status).toBe(200)
    // Hubo intentos al DELETE
    const deleteCalls = fetchSpy.mock.calls.filter(c =>
      (c[1] as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(1)

    consoleWarn.mockRestore()
  })

  it('DELETE tira excepción (timeout/network) → NO crashea, loguea', async () => {
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        throw new Error('network timeout')
      }
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await POST(signedReq({
      object: 'email', id: 'em_1', to: 'unknown@sinunmango.com.ar',
    }))

    expect(res.status).toBe(200)
    consoleWarn.mockRestore()
  })

  it('"no matching to address" SIN emailId → no llama DELETE (no hay nada que borrar)', async () => {
    const fetchSpy = setupFetchSpy()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.EMAIL_INBOUND_DOMAIN = 'sinunmango.com.ar'

    await POST(signedReq({ object: 'email', /* sin id */ to: [] }))

    const deleteCalls = fetchSpy.mock.calls.filter(c =>
      (c[1] as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(0)

    consoleWarn.mockRestore()
    delete process.env.EMAIL_INBOUND_DOMAIN
  })
})
