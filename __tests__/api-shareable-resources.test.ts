// Tests para /api/shareable-resources y /api/shares/incoming.
//
// Endpoints auxiliares del workspace V2 que no estaban cubiertos.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, getUserByIdMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserByIdMock:  vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    auth: { admin: { getUserById: getUserByIdMock } },
  },
}))

import { GET as getShareableResources } from '@/app/api/shareable-resources/route'
import { GET as getIncomingShares }     from '@/app/api/shares/incoming/route'

type Resp = { data: unknown; error: unknown }

function buildSupabase(tables: Record<string, Resp>) {
  function chain(tableName: string) {
    const terminal = tables[tableName] ?? { data: null, error: null }
    const c: Record<string, unknown> = {}
    for (const m of ['select','eq','neq','in','is','not','order','limit']) {
      c[m] = vi.fn(() => c)
    }
    c.maybeSingle = vi.fn(() => Promise.resolve(terminal))
    c.single      = vi.fn(() => Promise.resolve(terminal))
    c.then = (cb: (v: Resp) => unknown) => Promise.resolve(terminal).then(cb)
    return c
  }
  return { from: vi.fn((t: string) => chain(t)) }
}

const ME    = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  createClientMock.mockReset()
  getUserByIdMock.mockReset()
})

function makeReq(url: string) { return new NextRequest(url) }

describe('GET /api/shareable-resources', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await getShareableResources(makeReq('http://localhost/api/shareable-resources'))
    expect(res.status).toBe(401)
  })

  it('devuelve cuentas, gastos_fijos e inversiones del owner', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        cuentas:      { data: [
          { id: 'cta_1', nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA',         moneda: 'ARS' },
          { id: 'cta_2', nombre_cuenta: 'Visa',    tipo_cuenta: 'Tarjeta Credito',  moneda: 'ARS' },
        ], error: null },
        gastos_fijos: { data: [{ id: 'gf-1', nombre_gasto: 'Internet', monto_estimado: 15000, moneda: 'ARS' }], error: null },
        inversiones:  { data: [{ id: 'inv-1', nombre: 'PF Galicia', tipo: 'Plazo fijo', moneda: 'ARS' }], error: null },
      }),
    })

    const res = await getShareableResources(makeReq('http://localhost/api/shareable-resources'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cuentas).toHaveLength(2)
    expect(body.gastos_fijos).toHaveLength(1)
    expect(body.inversiones).toHaveLength(1)
  })

  it('cuando alguna query devuelve null → array vacío en respuesta', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        cuentas:      { data: null, error: null },
        gastos_fijos: { data: null, error: null },
        inversiones:  { data: null, error: null },
      }),
    })

    const res = await getShareableResources(makeReq('http://localhost/api/shareable-resources'))
    const body = await res.json()
    expect(body.cuentas).toEqual([])
    expect(body.gastos_fijos).toEqual([])
    expect(body.inversiones).toEqual([])
  })
})

describe('GET /api/shares/incoming', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await getIncomingShares(makeReq('http://localhost/api/shares/incoming'))
    expect(res.status).toBe(401)
  })

  it('devuelve shares aceptados con owner_email + resources extraidos', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          data: [{
            id: 's1', owner_user_id: OWNER, role: 'editor',
            accepted_at: '2026-05-10',
            share_resources: [
              { resource_type: 'cuenta',     resource_id: 'cta_1' },
              { resource_type: 'cuenta',     resource_id: 'cta_2' },
              { resource_type: 'gasto_fijo', resource_id: 'gf-1'  },
              { resource_type: 'inversion',  resource_id: 'inv-1' },
            ],
          }],
          error: null,
        },
      }),
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'owner@x.com' } }, error: null })

    const res = await getIncomingShares(makeReq('http://localhost/api/shares/incoming'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shares).toHaveLength(1)
    const s = body.shares[0]
    expect(s.owner_user_id).toBe(OWNER)
    expect(s.owner_email).toBe('owner@x.com')
    expect(s.role).toBe('editor')
    expect(s.resources.cuentas).toEqual(['cta_1', 'cta_2'])
    expect(s.resources.gastos_fijos).toEqual(['gf-1'])
    expect(s.resources.inversiones).toEqual(['inv-1'])
  })

  it('shares sin resources → arrays vacíos', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          data: [{ id: 's1', owner_user_id: OWNER, role: 'viewer', accepted_at: '2026-05-10', share_resources: null }],
          error: null,
        },
      }),
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'owner@x.com' } }, error: null })

    const res = await getIncomingShares(makeReq('http://localhost/api/shares/incoming'))
    const body = await res.json()
    expect(body.shares[0].resources).toEqual({ cuentas: [], gastos_fijos: [], inversiones: [] })
  })

  it('owner_email lookup falla → null, share igual aparece', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          data: [{ id: 's1', owner_user_id: OWNER, role: 'viewer', accepted_at: '2026-05-10', share_resources: [] }],
          error: null,
        },
      }),
    })
    getUserByIdMock.mockRejectedValueOnce(new Error('admin api down'))

    const res = await getIncomingShares(makeReq('http://localhost/api/shares/incoming'))
    const body = await res.json()
    expect(body.shares).toHaveLength(1)
    expect(body.shares[0].owner_email).toBeNull()
  })

  it('500 si query a shares falla', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { data: null, error: { message: 'DB down' } },
      }),
    })

    const res = await getIncomingShares(makeReq('http://localhost/api/shares/incoming'))
    expect(res.status).toBe(500)
  })

  it('sin shares incoming → array vacío', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { data: [], error: null },
      }),
    })

    const res = await getIncomingShares(makeReq('http://localhost/api/shares/incoming'))
    const body = await res.json()
    expect(body.shares).toEqual([])
  })
})
