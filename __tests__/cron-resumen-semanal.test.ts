// Tests para GET /api/cron/resumen-semanal
//
// Domingos. Para cada user con alerta_resumen_semanal=true: agrega
// ingresos/gastos de la semana, top 5 categorías, manda email.

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

import { GET } from '@/app/api/cron/resumen-semanal/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/resumen-semanal', {
    headers: { authorization: 'Bearer cron-secret' },
  })
}

function setupQueries(opts: {
  prefs:    Array<{ user_id: string; alerta_resumen_semanal: boolean }> | null
  movsByUser?: Record<string, Array<{ tipo_movimiento: 'Ingreso' | 'Gasto'; monto: number; categorias?: { nombre_categoria: string } | null }>>
}) {
  // prefs query: .from('user_preferences').select(...).eq('alerta_resumen_semanal', true)
  const prefsEq = vi.fn(() => Promise.resolve({ data: opts.prefs, error: null }))
  const prefsSelect = vi.fn(() => ({ eq: prefsEq }))

  // movs query: .from('movimientos').select(...).eq().gte().lte().in()
  const movsByUser = opts.movsByUser ?? {}
  const movsCalls = { current: 0 }
  let lastUserId = ''
  const inMethod = vi.fn(() => Promise.resolve({ data: movsByUser[lastUserId] ?? [], error: null }))
  const lte = vi.fn(() => ({ in: inMethod }))
  const gte = vi.fn(() => ({ lte }))
  const movsEq = vi.fn((_col: string, val: string) => {
    lastUserId = val
    return { gte }
  })
  const movsSelect = vi.fn(() => ({ eq: movsEq }))

  adminFromMock.mockImplementation((table: string) => {
    if (table === 'user_preferences') return { select: prefsSelect }
    if (table === 'movimientos')      { movsCalls.current++; return { select: movsSelect } }
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

describe('GET /api/cron/resumen-semanal', () => {
  it('401 sin header', async () => {
    const req = new NextRequest('http://localhost/api/cron/resumen-semanal')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('200 sent=0 si no hay users con resumen semanal activo', async () => {
    setupQueries({ prefs: [] })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.message).toContain('Sin usuarios')
  })

  it('200 sent=0 si prefs query devuelve null', async () => {
    setupQueries({ prefs: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
  })

  it('manda email a user activo con sus movs agregados', async () => {
    setupQueries({
      prefs: [{ user_id: 'u1', alerta_resumen_semanal: true }],
      movsByUser: {
        u1: [
          { tipo_movimiento: 'Ingreso', monto: 100000, categorias: null },
          { tipo_movimiento: 'Gasto',   monto: 5000,   categorias: { nombre_categoria: 'Súper' } },
          { tipo_movimiento: 'Gasto',   monto: 3000,   categorias: { nombre_categoria: 'Súper' } },
          { tipo_movimiento: 'Gasto',   monto: 2500,   categorias: { nombre_categoria: 'Transporte' } },
        ],
      },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u1@test.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(1)

    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(callBody.to).toEqual(['u1@test.com'])
    expect(callBody.subject).toContain('resumen semanal')
    expect(callBody.html).toContain('100.000')  // ingresos
    expect(callBody.html).toContain('10.500')   // gastos (5k + 3k + 2.5k)
    expect(callBody.html).toContain('Súper')    // top categoría
  })

  it('agrupa por categoría correctamente; Sin categoría si null', async () => {
    setupQueries({
      prefs: [{ user_id: 'u1', alerta_resumen_semanal: true }],
      movsByUser: {
        u1: [
          { tipo_movimiento: 'Gasto', monto: 1000, categorias: null },
          { tipo_movimiento: 'Gasto', monto: 500,  categorias: { nombre_categoria: 'Súper' } },
        ],
      },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u@e.com' } }, error: null })
    const fetchFn = mockResendFetch()

    await GET(makeReq())
    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(callBody.html).toContain('Sin categoría')
  })

  it('sin RESEND_API_KEY → loguea pero no manda', async () => {
    delete process.env.RESEND_API_KEY
    setupQueries({
      prefs: [{ user_id: 'u1', alerta_resumen_semanal: true }],
      movsByUser: { u1: [{ tipo_movimiento: 'Gasto', monto: 100 }] },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'x@y.com' } }, error: null })
    const fetchFn = mockResendFetch()
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
    consoleLog.mockRestore()
  })
})
