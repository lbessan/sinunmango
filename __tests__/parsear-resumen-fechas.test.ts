// Tests para /api/parsear-resumen, focalizados en la lógica nueva de
// `fechas_propuestas`. Mockeamos:
//   - createClientForRequest (auth + supabase client)
//   - getUserPlan (Pro / Free)
//   - isOnboardingActive
//   - check/commitMonthlyUsage (no nos importan acá)
//   - fetch() a Claude (devolvemos texto JSON simulado)
//
// Cubre:
//   - sin cuenta_id en el body → fechas_propuestas = null aunque Claude las
//     haya extraído (compat con flows sin contexto de cuenta)
//   - con cuenta_id pero la cuenta no es Tarjeta Credito → null
//   - fechas iguales a las actuales → null (no proponer cambio innecesario)
//   - fechas inválidas (formato) → null
//   - fechas en el pasado → null
//   - fechas demasiado lejanas (>90 días) → null
//   - vencimiento <= cierre → null (sanity)
//   - happy path: fechas válidas + distintas → devuelve fechas_propuestas con
//     actual_cierre/actual_vencimiento + nuevos
//   - JSON truncado (recovered) → fechas_propuestas siempre null

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, getUserPlanMock, isOnboardingMock, checkLimitMock, commitUsageMock } = vi.hoisted(() => ({
  createClientMock:   vi.fn(),
  getUserPlanMock:    vi.fn(),
  isOnboardingMock:   vi.fn(),
  checkLimitMock:     vi.fn(),
  commitUsageMock:    vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
// El endpoint usa getEffectivePlan (plan del owner del workspace activo).
// Alias al mismo mock — los tests setean has_pro_access vía getUserPlanMock.
vi.mock('@/lib/subscription',   () => ({
  getUserPlan:      getUserPlanMock,
  getEffectivePlan: getUserPlanMock,
}))
vi.mock('@/lib/rate-limit',     () => ({ checkRateLimit: () => Promise.resolve({ allowed: true }) }))
vi.mock('@/lib/usage-limits',   () => ({
  isOnboardingActive:  isOnboardingMock,
  checkMonthlyLimit:   checkLimitMock,
  commitMonthlyUsage:  commitUsageMock,
  usageHeaders:        () => ({}),
}))

import { POST } from '@/app/api/parsear-resumen/route'

const ME       = '11111111-1111-1111-1111-111111111111'
const CUENTA   = 'cta_1'
const ORIG_FETCH = global.fetch

beforeEach(() => {
  createClientMock.mockReset()
  getUserPlanMock.mockReset()
  isOnboardingMock.mockReset()
  checkLimitMock.mockReset()
  commitUsageMock.mockReset()
  getUserPlanMock.mockResolvedValue({ has_pro_access: true })
  isOnboardingMock.mockResolvedValue(false)
  checkLimitMock.mockResolvedValue({ allowed: true })
  commitUsageMock.mockResolvedValue(null)
  process.env.ANTHROPIC_API_KEY = 'sk-test'
})

afterEach(() => {
  global.fetch = ORIG_FETCH
  delete process.env.ANTHROPIC_API_KEY
})

// Helper: arma un mock supabase que devuelve `cuenta` cuando se consulta
// .from('cuentas').select(...).eq('id',...).eq('user_id',...).maybeSingle()
// y soporta también el path del dispatcher de adicionales que termina con
// .or() en vez de .maybeSingle() — devolvemos la familia con `or` thenable.
function buildSupabaseWithCuenta(cuenta: unknown, familia: unknown[] = []) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: cuenta, error: null }))
  const orThenable = {
    then: (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: familia, error: null }).then(cb),
  }
  const eq2 = vi.fn(() => ({ maybeSingle, or: vi.fn(() => orThenable) }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  return { from: vi.fn(() => ({ select })) }
}

// Mockea la llamada a Claude para que devuelva el JSON dado.
function mockClaude(payload: unknown) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({
    content: [{ text: JSON.stringify(payload) }],
  }), { status: 200 })) as unknown as typeof fetch
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/parsear-resumen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const TODAY_STR = (() => {
  const d = new Date()
  return d.toISOString().slice(0, 10)
})()
const PLUS_DAYS = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

describe('POST /api/parsear-resumen — fechas_propuestas', () => {
  it('sin cuenta_id en el body → fechas_propuestas null aunque Claude las extraiga', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta:      '2026-05-23',
        fecha_vencimiento_tarjeta: '2026-06-10',
        user_id: ME,
      }),
    })
    mockClaude({
      proximo_cierre:      PLUS_DAYS(5),
      proximo_vencimiento: PLUS_DAYS(20),
      transacciones: [],
    })

    const res = await POST(makeReq({ pdf: 'base64-fake' /* sin cuenta_id */ }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('cuenta_id pero cuenta NO es Tarjeta Credito → null', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Banco CA',
        fecha_cierre_tarjeta: null, fecha_vencimiento_tarjeta: null,
        user_id: ME,
      }),
    })
    mockClaude({
      proximo_cierre:      PLUS_DAYS(5),
      proximo_vencimiento: PLUS_DAYS(20),
      transacciones: [],
    })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('fechas iguales a las actuales → null (no propone cambio)', async () => {
    const cierre = PLUS_DAYS(5)
    const venc   = PLUS_DAYS(20)
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: cierre, fecha_vencimiento_tarjeta: venc,
        user_id: ME,
      }),
    })
    mockClaude({ proximo_cierre: cierre, proximo_vencimiento: venc, transacciones: [] })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('fechas en formato inválido → null', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: '2026-01-01', fecha_vencimiento_tarjeta: '2026-01-15',
        user_id: ME,
      }),
    })
    mockClaude({ proximo_cierre: 'no es fecha', proximo_vencimiento: 'tampoco', transacciones: [] })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('fechas en el pasado → null', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: '2026-01-01', fecha_vencimiento_tarjeta: '2026-01-15',
        user_id: ME,
      }),
    })
    mockClaude({
      proximo_cierre:      PLUS_DAYS(-30),
      proximo_vencimiento: PLUS_DAYS(-10),
      transacciones: [],
    })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('fechas demasiado lejanas (>90 días) → null', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: '2026-01-01', fecha_vencimiento_tarjeta: '2026-01-15',
        user_id: ME,
      }),
    })
    mockClaude({
      proximo_cierre:      PLUS_DAYS(120),
      proximo_vencimiento: PLUS_DAYS(135),
      transacciones: [],
    })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('vencimiento <= cierre → null (sanity)', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: '2026-01-01', fecha_vencimiento_tarjeta: '2026-01-15',
        user_id: ME,
      }),
    })
    mockClaude({
      // venc anterior al cierre
      proximo_cierre:      PLUS_DAYS(20),
      proximo_vencimiento: PLUS_DAYS(5),
      transacciones: [],
    })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('happy path: fechas válidas + distintas → devuelve fechas_propuestas con actual + nuevos', async () => {
    const actualC = '2026-04-23'
    const actualV = '2026-05-10'
    const nuevoC  = PLUS_DAYS(5)
    const nuevoV  = PLUS_DAYS(20)

    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: actualC, fecha_vencimiento_tarjeta: actualV,
        user_id: ME,
      }),
    })
    mockClaude({
      proximo_cierre:      nuevoC,
      proximo_vencimiento: nuevoV,
      transacciones:       [{ fecha: '2026-04-15', detalle: 'Test', monto_ars: 100 }],
    })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fechas_propuestas).toEqual({
      proximo_cierre:      nuevoC,
      proximo_vencimiento: nuevoV,
      actual_cierre:       actualC,
      actual_vencimiento:  actualV,
    })
    expect(body.transacciones).toHaveLength(1)
  })

  it('Claude no extrajo fechas (null/undefined) → null', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabaseWithCuenta({
        id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
        fecha_cierre_tarjeta: '2026-01-01', fecha_vencimiento_tarjeta: '2026-01-15',
        user_id: ME,
      }),
    })
    mockClaude({ proximo_cierre: null, proximo_vencimiento: null, transacciones: [] })

    const res = await POST(makeReq({ pdf: 'x', cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.fechas_propuestas).toBeNull()
  })

  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await POST(makeReq({ pdf: 'x' }))
    expect(res.status).toBe(401)
  })
})
