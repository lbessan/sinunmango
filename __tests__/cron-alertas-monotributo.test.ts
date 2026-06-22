// Tests para GET /api/cron/alertas-monotributo
//
// Cron semanal. Para cada user con config de monotributo, evalúa alertas y
// manda email SOLO si hay warning/danger. Cubre: auth, sin configs, sin
// alertas accionables (no manda), con alertas (manda con subject correcto).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { fromMock, getUserByIdMock } = vi.hoisted(() => ({
  fromMock:        vi.fn(),
  getUserByIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  },
}))

import { GET } from '@/app/api/cron/alertas-monotributo/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/alertas-monotributo', {
    headers: { authorization: 'Bearer cron-secret' },
  })
}

// Configura el mock de adminClient.from para devolver:
//   - configs cuando se consulta 'monotributo_config' (select directo)
//   - facturas cuando se consulta 'facturas_emitidas' (select().eq())
function setData(opts: {
  configs?:  Array<Record<string, unknown>> | null
  facturas?: Array<Record<string, unknown>>
  configError?: { message: string }
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'monotributo_config') {
      return {
        select: vi.fn(() => Promise.resolve({
          data:  opts.configs ?? [],
          error: opts.configError ?? null,
        })),
      }
    }
    // facturas_emitidas: select().eq() → resuelve facturas
    const eq = vi.fn(() => Promise.resolve({ data: opts.facturas ?? [], error: null }))
    return { select: vi.fn(() => ({ eq })) }
  })
}

function mockResendFetch() {
  const fn = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fn)
  return fn
}

// HOY real no importa para los tests de "manda/no manda" porque controlamos
// la facturación directamente — usamos montos relativos al límite.
const CONFIG_CERCA = {
  user_id: 'u1', categoria: 'B', actividad: 'servicios',
  limite_facturacion_anual: 10_000_000, costo_mensual: 35_000,
}

beforeEach(() => {
  fromMock.mockReset()
  getUserByIdMock.mockReset()
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'lucho@test.com' } } })
  process.env.CRON_SECRET = 'cron-secret'
  process.env.RESEND_API_KEY = 'rk_test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CRON_SECRET
  delete process.env.RESEND_API_KEY
})

describe('GET /api/cron/alertas-monotributo — auth', () => {
  it('401 sin header válido', async () => {
    const res = await GET(new NextRequest('http://localhost/api/cron/alertas-monotributo'))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/alertas-monotributo — empty cases', () => {
  it('200 sent=0 si no hay configs', async () => {
    setData({ configs: [] })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
  })

  it('no manda email si la facturación está holgada (sin alertas accionables)', async () => {
    // Factura reciente baja (10% del límite) → sin warning/danger.
    // Usamos una fecha reciente relativa para que entre en los 12 meses.
    const reciente = new Date()
    reciente.setMonth(reciente.getMonth() - 1)
    const iso = reciente.toISOString().slice(0, 10)
    setData({
      configs:  [CONFIG_CERCA],
      facturas: [{ id: 'f1', fecha: iso, cliente: 'X', monto: 1_000_000 }],
    })
    const fetchFn = mockResendFetch()
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/alertas-monotributo — manda email', () => {
  it('manda email danger si superó el límite', async () => {
    const reciente = new Date()
    reciente.setMonth(reciente.getMonth() - 1)
    const iso = reciente.toISOString().slice(0, 10)
    setData({
      configs:  [CONFIG_CERCA],
      facturas: [{ id: 'f1', fecha: iso, cliente: 'X', monto: 12_000_000 }],  // > 10M
    })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string)
    expect(reqBody.to).toEqual(['lucho@test.com'])
    expect(reqBody.subject).toContain('🔴')
  })

  it('no manda si RESEND_API_KEY no está, pero no rompe', async () => {
    delete process.env.RESEND_API_KEY
    const reciente = new Date()
    reciente.setMonth(reciente.getMonth() - 1)
    const iso = reciente.toISOString().slice(0, 10)
    setData({
      configs:  [CONFIG_CERCA],
      facturas: [{ id: 'f1', fecha: iso, cliente: 'X', monto: 12_000_000 }],
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
  })
})
