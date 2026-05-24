// Tests para GET /api/cron/resumen-mensual
//
// Día 1 del mes. Para cada user con alerta_resumen_mensual=true: agrega
// ingresos/gastos del mes anterior, top 5 categorías, manda email.
// Muy similar al de resumen-semanal.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { adminFromMock, getUserByIdMock } = vi.hoisted(() => ({
  adminFromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    from: adminFromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  },
}))

import { GET } from '@/app/api/cron/resumen-mensual/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/resumen-mensual', {
    headers: { authorization: 'Bearer cron-secret' },
  })
}

function setupQueries(opts: {
  prefs:    Array<{ user_id: string; alerta_resumen_mensual: boolean }> | null
  movsByUser?: Record<string, Array<{ tipo_movimiento: 'Ingreso' | 'Gasto'; monto: number; categorias?: { nombre_categoria: string } | null }>>
}) {
  const prefsEq = vi.fn(() => Promise.resolve({ data: opts.prefs, error: null }))
  const prefsSelect = vi.fn(() => ({ eq: prefsEq }))

  const movsByUser = opts.movsByUser ?? {}
  let lastUserId = ''
  const inMethod = vi.fn(() => Promise.resolve({ data: movsByUser[lastUserId] ?? [], error: null }))
  // resumen-mensual usa .lt() en lugar de .lte() (último día del mes exclusivo)
  const ltMethod = vi.fn(() => ({ in: inMethod }))
  const gte = vi.fn(() => ({ lt: ltMethod }))
  const movsEq = vi.fn((_col: string, val: string) => { lastUserId = val; return { gte } })
  const movsSelect = vi.fn(() => ({ eq: movsEq }))

  adminFromMock.mockImplementation((table: string) => {
    if (table === 'user_preferences') return { select: prefsSelect }
    if (table === 'movimientos')      return { select: movsSelect }
    return { select: vi.fn() }
  })
}

function mockResendFetch(ok = true) {
  const fn = vi.fn(async () => new Response('{}', { status: ok ? 200 : 500 }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  adminFromMock.mockReset()
  getUserByIdMock.mockReset()
  process.env.CRON_SECRET    = 'cron-secret'
  process.env.RESEND_API_KEY = 'rk_test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CRON_SECRET
  delete process.env.RESEND_API_KEY
})

describe('GET /api/cron/resumen-mensual', () => {
  it('401 sin header', async () => {
    const req = new NextRequest('http://localhost/api/cron/resumen-mensual')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('200 sent=0 si no hay users con resumen mensual activo', async () => {
    setupQueries({ prefs: [] })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.message).toContain('Sin usuarios')
  })

  it('manda email mensual a user activo', async () => {
    setupQueries({
      prefs: [{ user_id: 'u1', alerta_resumen_mensual: true }],
      movsByUser: {
        u1: [
          { tipo_movimiento: 'Ingreso', monto: 500000, categorias: null },
          { tipo_movimiento: 'Gasto',   monto: 50000, categorias: { nombre_categoria: 'Alquiler' } },
          { tipo_movimiento: 'Gasto',   monto: 30000, categorias: { nombre_categoria: 'Súper' } },
        ],
      },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u@e.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(1)
    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(callBody.subject).toContain('resumen')
    expect(callBody.html).toContain('500.000')
    expect(callBody.html).toContain('Alquiler')
  })

  it('user sin email registrado → cae al fallback', async () => {
    process.env.ALERT_EMAIL = 'fallback@test.com'
    setupQueries({
      prefs: [{ user_id: 'u1', alerta_resumen_mensual: true }],
      movsByUser: { u1: [] },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: null }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(callBody.to).toEqual(['fallback@test.com'])
    delete process.env.ALERT_EMAIL
  })

  it('Resend falla → cuenta como no-sent, loguea', async () => {
    setupQueries({
      prefs: [{ user_id: 'u1', alerta_resumen_mensual: true }],
      movsByUser: { u1: [{ tipo_movimiento: 'Gasto', monto: 100 }] },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'a@b.com' } }, error: null })
    mockResendFetch(false)
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    consoleErr.mockRestore()
  })
})
