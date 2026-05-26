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

// Construye los mocks de Supabase para las tres queries que hace el cron:
//   1. .from('gastos_fijos').select(...).eq('activo', true).not('dia_vencimiento', 'is', null)
//   2. .from('cuentas').select(...).eq('tipo_cuenta', 'Tarjeta Credito').eq('activa', true).not('fecha_vencimiento_tarjeta', 'is', null)
//   3. .from('user_preferences').select(...).in('user_id', userIds)
function setupQueries(opts: {
  gastosFijos:    Array<Record<string, unknown>>
  tarjetas?:      Array<Record<string, unknown>>
  userPreferences?: Array<Record<string, unknown>>
  gastosError?:   unknown
  tarjetasError?: unknown
}) {
  const gastosNot = vi.fn(() => Promise.resolve({ data: opts.gastosFijos, error: opts.gastosError ?? null }))
  const gastosEq = vi.fn(() => ({ not: gastosNot }))
  const gastosSelect = vi.fn(() => ({ eq: gastosEq }))

  // Tarjetas usa dos .eq() encadenados (tipo_cuenta + activa) y después .not()
  const tarjetasNot = vi.fn(() => Promise.resolve({ data: opts.tarjetas ?? [], error: opts.tarjetasError ?? null }))
  const tarjetasEq2 = vi.fn(() => ({ not: tarjetasNot }))
  const tarjetasEq1 = vi.fn(() => ({ eq: tarjetasEq2 }))
  const tarjetasSelect = vi.fn(() => ({ eq: tarjetasEq1 }))

  const prefsIn = vi.fn(() => Promise.resolve({ data: opts.userPreferences ?? [], error: null }))
  const prefsSelect = vi.fn(() => ({ in: prefsIn }))

  adminFromMock.mockImplementation((table: string) => {
    if (table === 'gastos_fijos')     return { select: gastosSelect }
    if (table === 'cuentas')          return { select: tarjetasSelect }
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
    expect(body.message).toContain('No hay vencimientos')
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

describe('GET /api/cron/alertas-vencimientos — tarjetas de crédito', () => {
  it('200 vacío cuando no hay gastos NI tarjetas', async () => {
    setupQueries({ gastosFijos: [], tarjetas: [] })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.message).toContain('No hay vencimientos')
  })

  it('manda email si tarjeta vence hoy (sin gastos fijos)', async () => {
    const today    = new Date().getDate()
    const todayStr = `2026-05-${String(today).padStart(2, '0')}`
    setupQueries({
      gastosFijos: [],
      tarjetas: [
        { id: 'cta_1', user_id: 'u1', nombre_cuenta: 'Visa Galicia',
          fecha_vencimiento_tarjeta: todayStr },
      ],
      userPreferences: [{ user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3] }],
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u1@test.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(1)

    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(callBody.subject).toContain('Visa Galicia')
    expect(callBody.subject).toContain('HOY')
    expect(callBody.html).toContain('Vencimientos de tarjeta')
    expect(callBody.html).toContain('Visa Galicia')
  })

  it('skip tarjeta si su día no matchea alerta_vencimientos_dias', async () => {
    const today    = new Date().getDate()
    // venc hoy + 5 días → no está en [0,1,3]
    const farDay   = ((today + 5 - 1) % 28) + 1   // sigue siendo válido (1-28)
    const farStr   = `2026-05-${String(farDay).padStart(2, '0')}`
    setupQueries({
      gastosFijos: [],
      tarjetas: [
        { id: 'cta_1', user_id: 'u1', nombre_cuenta: 'Visa', fecha_vencimiento_tarjeta: farStr },
      ],
      userPreferences: [{ user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3] }],
    })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('combina gasto fijo + tarjeta del mismo user en un solo email', async () => {
    const today    = new Date().getDate()
    const todayStr = `2026-05-${String(today).padStart(2, '0')}`
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'Netflix', monto_estimado: 5000,
          moneda: 'ARS', dia_vencimiento: today, activo: true,
          cuentas: { nombre_cuenta: 'Galicia', tipo_cuenta: 'banco' }, categorias: null },
      ],
      tarjetas: [
        { id: 'cta_1', user_id: 'u1', nombre_cuenta: 'Visa Galicia', fecha_vencimiento_tarjeta: todayStr },
      ],
      userPreferences: [{ user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3] }],
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'u1@test.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(body.results[0].count).toBe(2)  // gasto + tarjeta

    const callBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    // Ambos en el email
    expect(callBody.html).toContain('Netflix')
    expect(callBody.html).toContain('Visa Galicia')
    // Dos secciones distintas
    expect(callBody.html).toContain('Gastos fijos')
    expect(callBody.html).toContain('Vencimientos de tarjeta')
  })

  it('users distintos: cada uno recibe su propio email', async () => {
    const today    = new Date().getDate()
    const todayStr = `2026-05-${String(today).padStart(2, '0')}`
    setupQueries({
      gastosFijos: [
        { id: 'g1', user_id: 'u1', nombre_gasto: 'Netflix', monto_estimado: 5000,
          moneda: 'ARS', dia_vencimiento: today, activo: true, cuentas: null, categorias: null },
      ],
      tarjetas: [
        { id: 'cta_2', user_id: 'u2', nombre_cuenta: 'Visa', fecha_vencimiento_tarjeta: todayStr },
      ],
      userPreferences: [
        { user_id: 'u1', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3] },
        { user_id: 'u2', alerta_vencimientos_activa: true, alerta_vencimientos_dias: [0, 1, 3] },
      ],
    })
    getUserByIdMock.mockResolvedValue({ data: { user: { email: 'x@test.com' } }, error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('500 si query de tarjetas falla', async () => {
    setupQueries({
      gastosFijos: [],
      tarjetas: [],
      tarjetasError: { message: 'tarjetas table down' },
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('tarjetas table down')
  })
})
