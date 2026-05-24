// Tests para GET /api/cron/actualizar-dolar

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { adminFromMock } = vi.hoisted(() => ({ adminFromMock: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

import { GET } from '@/app/api/cron/actualizar-dolar/route'

function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  return new NextRequest('http://localhost/api/cron/actualizar-dolar', { headers })
}

function mockFetch(opts: { body?: unknown; status?: number; throws?: Error }) {
  const fn = vi.fn(async () => {
    if (opts.throws) throw opts.throws
    return new Response(JSON.stringify(opts.body ?? {}), { status: opts.status ?? 200 })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function setUpdateResult(opts: { count?: number; error?: unknown } = {}) {
  const eq = vi.fn(() => Promise.resolve({ count: opts.count ?? null, error: opts.error ?? null }))
  const update = vi.fn(() => ({ eq }))
  adminFromMock.mockReturnValueOnce({ update })
  return { update, eq }
}

beforeEach(() => {
  adminFromMock.mockReset()
  process.env.CRON_SECRET = 'cron-secret'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CRON_SECRET
})

describe('GET /api/cron/actualizar-dolar — auth', () => {
  it('503 sin CRON_SECRET en env', async () => {
    delete process.env.CRON_SECRET
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(makeReq('Bearer cualquiera'))
    expect(res.status).toBe(503)
    consoleErr.mockRestore()
  })

  it('401 sin header authorization', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('401 con header incorrecto', async () => {
    const res = await GET(makeReq('Bearer otro-secret'))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/actualizar-dolar — fetch BNA', () => {
  it('200 con cotización + count actualizados', async () => {
    mockFetch({ body: { venta: 1234.7, compra: 1230 } })
    const { update, eq } = setUpdateResult({ count: 42 })

    const res = await GET(makeReq('Bearer cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.valor).toBe(1235)  // Math.round(1234.7)
    expect(body.usuarios_actualizados).toBe(42)
    expect(update).toHaveBeenCalledWith({ valor: 1235 }, { count: 'exact' })
    expect(eq).toHaveBeenCalledWith('id', 'Dolar_Tarjeta_BNA')
  })

  it('usa compra como fallback si venta es null', async () => {
    mockFetch({ body: { venta: null, compra: 1100 } })
    setUpdateResult({ count: 10 })

    const res = await GET(makeReq('Bearer cron-secret'))
    const body = await res.json()
    expect(body.valor).toBe(1100)
  })

  it('500 si fetch a BNA falla con HTTP error', async () => {
    mockFetch({ status: 503 })
    const res = await GET(makeReq('Bearer cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain('No se pudo obtener cotización')
    expect(body.error).toContain('HTTP 503')
  })

  it('500 si fetch tira (timeout, red caída)', async () => {
    mockFetch({ throws: new Error('network timeout') })
    const res = await GET(makeReq('Bearer cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('network timeout')
  })

  it('500 si BNA devuelve datos sin venta ni compra (valor inválido)', async () => {
    mockFetch({ body: { foo: 'bar' } })  // sin venta/compra
    const res = await GET(makeReq('Bearer cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Valor inválido')
  })

  it('500 si BNA devuelve 0', async () => {
    mockFetch({ body: { venta: 0 } })
    const res = await GET(makeReq('Bearer cron-secret'))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/cron/actualizar-dolar — DB error', () => {
  it('500 si el UPDATE tira error', async () => {
    mockFetch({ body: { venta: 1000 } })
    setUpdateResult({ error: { message: 'pg connection lost' } })

    const res = await GET(makeReq('Bearer cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('pg connection lost')
  })

  it('count=null en respuesta del UPDATE → 0 usuarios actualizados', async () => {
    mockFetch({ body: { venta: 1000 } })
    setUpdateResult({ count: null })

    const res = await GET(makeReq('Bearer cron-secret'))
    const body = await res.json()
    expect(body.usuarios_actualizados).toBe(0)
  })
})
