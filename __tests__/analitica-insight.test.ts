// Tests para POST /api/analitica-insight
//
// Diferente al resto de AI endpoints: gateado por PLAN PRO, no por cupo
// mensual. Free recibe 403 con requires_pro=true.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, rateLimitMock, getUserPlanMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rateLimitMock:    vi.fn(),
  getUserPlanMock:  vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/rate-limit',     () => ({ checkRateLimit: rateLimitMock }))
// El endpoint usa getEffectivePlan (plan del owner del workspace activo).
// Alias al mismo mock — los tests setean has_pro_access vía getUserPlanMock
// y ese valor sirve igual como plan efectivo (los tests no diferencian).
vi.mock('@/lib/subscription',   () => ({
  getUserPlan:      getUserPlanMock,
  getEffectivePlan: getUserPlanMock,
}))

import { POST } from '@/app/api/analitica-insight/route'

function makeReq(body: unknown = { type: 'narrativa', periodo: { desde: '2026-05-01', hasta: '2026-05-31' }, contexto: 'x' }): NextRequest {
  return new NextRequest('http://localhost/api/analitica-insight', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function mockClaudeFetch(opts: { body?: unknown; status?: number; throws?: Error }) {
  const fn = vi.fn(async () => {
    if (opts.throws) throw opts.throws
    return new Response(
      typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? {}),
      { status: opts.status ?? 200 },
    )
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  createClientMock.mockReset()
  rateLimitMock.mockReset()
  getUserPlanMock.mockReset()

  createClientMock.mockResolvedValue({ supabase: {}, user: { id: 'u1' } })
  rateLimitMock.mockResolvedValue({ allowed: true, message: '' })
  getUserPlanMock.mockResolvedValue({ plan: 'pro', plan_expires_at: '2099-01-01', has_pro_access: true })
  process.env.ANTHROPIC_API_KEY = 'sk-fake'
})

describe('POST /api/analitica-insight', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('403 si user es Free (no Pro)', async () => {
    getUserPlanMock.mockResolvedValueOnce({ plan: 'free', plan_expires_at: null, has_pro_access: false })
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.requires_pro).toBe(true)
  })

  it('429 rate limited', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'slow down' })
    const res = await POST(makeReq())
    expect(res.status).toBe(429)
  })

  it('rate limit más restrictivo para type=profundo (5 por 5 min)', async () => {
    mockClaudeFetch({ body: { content: [{ text: '{}' }] } })
    await POST(makeReq({ type: 'profundo', periodo: { desde: 'a', hasta: 'b' }, contexto: 'x' }))
    expect(rateLimitMock).toHaveBeenCalledWith(
      'u1',
      '/api/analitica-insight:profundo',
      { max: 5, windowSeconds: 300 },
    )
  })

  it('rate limit más laxo para type=narrativa (20/min)', async () => {
    mockClaudeFetch({ body: { content: [{ text: '{}' }] } })
    await POST(makeReq({ type: 'narrativa', periodo: { desde: 'a', hasta: 'b' }, contexto: 'x' }))
    expect(rateLimitMock).toHaveBeenCalledWith(
      'u1',
      '/api/analitica-insight:narrativa',
      { max: 20, windowSeconds: 60 },
    )
  })

  it('503 sin ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await POST(makeReq())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('AI no configurada')
  })

  it('happy path: devuelve el JSON parseado de Claude', async () => {
    mockClaudeFetch({
      body: { content: [{ text: '{"narrativa":"Hola","highlights":[]}' }] },
    })
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.narrativa).toBe('Hola')
  })

  it('limpia ```json wrapper antes de parsear', async () => {
    mockClaudeFetch({
      body: { content: [{ text: '```json\n{"narrativa":"x"}\n```' }] },
    })
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.narrativa).toBe('x')
  })

  it('502 si JSON inválido en respuesta de Claude', async () => {
    mockClaudeFetch({
      body: { content: [{ text: 'no es json' }] },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('inválida')
    consoleErr.mockRestore()
  })

  it('502 si Claude devuelve error HTTP', async () => {
    mockClaudeFetch({ status: 500, body: 'internal' })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    consoleErr.mockRestore()
  })

  it('504 si Claude timeoutea', async () => {
    const timeoutErr = new DOMException('timed out', 'TimeoutError')
    mockClaudeFetch({ throws: timeoutErr })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq())
    expect(res.status).toBe(504)
    consoleErr.mockRestore()
  })
})
