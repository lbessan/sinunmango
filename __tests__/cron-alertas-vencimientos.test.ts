// Tests para GET /api/cron/alertas-vencimientos
//
// Cron diario. Para cada user con alerta_vencimientos_activa=true:
//   - encuentra sus gastos_fijos cuyos días restantes están en
//     alerta_vencimientos_dias
//   - manda email con Resend

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { adminFromMock, getUserByIdMock } = vi.hoisted(() => ({
  adminFromMock:     vi.fn(),
  getUserByIdMock:   vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    from: adminFromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  },
}))

import { GET } from '@/app/api/cron/alertas-vencimientos/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/alertas-vencimientos', {
    headers: { authorization: 'Bearer cron-secret' },
  })
}

// Construye los mocks de Supabase para las dos queries que hace el cron:
//   1. .from('gastos_fijos').select(...).eq('activo', true).not('dia_vencimiento', 'is', null)
//   2. .from('user_preferences').select(...).in('user_id', userIds)
function setupQueries(opts: {
  gastosFijos:    Array<Record<string, unknown>>
  userPreferences?: Array<Record<string, unknown>>
  gastosError?:   unknown
}) {
  const gastosNot = vi.fn(() => Promise.resolve({ data: opts.gastosFijos, error: opts.gastosError ?? null }))
  const gastosEq = vi.fn(() => ({ not: gastosNot }))
  const gastosSelect = vi.fn(() => ({ eq: gastosEq }))

  const prefsIn = vi.fn(() => Promise.resolve({ data: opts.userPreferences ?? [], error: null }))
  const prefsSelect = vi.fn(() => ({ in: prefsIn }))

  adminFromMock.mockImplementation((table: string) => {
    if (table === 'gastos_fijos')     return { select: gastosSelect }
    if (table === 'user_preferences') return { select: prefsSelect }
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

describe('GET /api/cron/alertas-vencimientos — auth', () => {
  it('401 sin header', async () => {
    const req = new NextRequest('http://localhost/api/cron/alertas-vencimientos')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/alertas-vencimientos — empty cases', () => {
  it('200 sent=0 si no hay gastos activos', async () => {
    setupQueries({ gastosFijos: [] })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.message).toContain('No hay gastos')
  })

  it('500 si query de gastos falla', async () => {
    setupQueries({ gastosFijos: [], gastosError: { message: 'db down' } })
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('db down')
  })

  it('skip user si alerta_vencimientos_activa=false', async () => {
    const today = new Date().getDate()
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'Netflix', monto_estimado: 5000,
          moneda: 'ARS', dia_vencimiento: today, activo: true, cuentas: null, categorias: null },
      ],
      userPreferences: [{
        user_id: 'u1', alerta_vencimientos_activa: false, alerta_vencimientos_dias: [0],
      }],
    })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/alertas-vencimientos — alerta de hoy', () => {
  it('manda email si día vencimiento = hoy y el user tiene 0 en alertarEn', async () => {
    const today = new Date().getDate()
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'Netflix', monto_estimado: 5000,
          moneda: 'ARS', dia_vencimiento: today, activo: true,
          cuentas: { nombre_cuenta: 'Galicia', tipo_cuenta: 'banco' }, categorias: null },
      ],
      userPreferences: [{
        user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3],
      }],
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u1@test.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(callBody.to).toEqual(['u1@test.com'])
    expect(callBody.subject).toContain('Netflix')
    expect(callBody.subject).toContain('HOY')
  })

  it('user sin preferences usa defaults [0,1,3]', async () => {
    const today = new Date().getDate()
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'X', monto_estimado: 100,
          moneda: 'ARS', dia_vencimiento: today, activo: true, cuentas: null, categorias: null },
      ],
      userPreferences: [],  // sin prefs → default activa + [0,1,3]
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u1@test.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(fetchFn).toHaveBeenCalled()
  })

  it('sin RESEND_API_KEY → no manda emails pero loguea', async () => {
    delete process.env.RESEND_API_KEY
    const today = new Date().getDate()
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'X', monto_estimado: 100,
          moneda: 'ARS', dia_vencimiento: today, activo: true, cuentas: null, categorias: null },
      ],
      userPreferences: [{ user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0] }],
    })
    const fetchFn = mockResendFetch()
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
    consoleLog.mockRestore()
  })

  it('Resend devuelve error → cuenta como no-sent', async () => {
    const today = new Date().getDate()
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'X', monto_estimado: 100,
          moneda: 'ARS', dia_vencimiento: today, activo: true, cuentas: null, categorias: null },
      ],
      userPreferences: [{ user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0] }],
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'a@b.com' } }, error: null })
    mockResendFetch(false)
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.results[0].sent).toBe(false)
    consoleErr.mockRestore()
  })

  it('skip gasto si su día no matchea alerta_vencimientos_dias del user', async () => {
    const today = new Date().getDate()
    // dia_vencimiento = today + 5 (no está en [0,1,3])
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'X', monto_estimado: 100,
          moneda: 'ARS', dia_vencimiento: today + 5, activo: true, cuentas: null, categorias: null },
      ],
      userPreferences: [{ user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3] }],
    })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
