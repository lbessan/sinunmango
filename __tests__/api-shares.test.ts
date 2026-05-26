// Tests para /api/shares (POST, GET) y /api/shares/[id] (DELETE, PATCH).
//
// Cubre:
//   POST:    401 sin auth, 403 si no es Pro, 400 con body inválido,
//            400 si algún recurso no es del owner, 200 happy path.
//   GET:     401 sin auth, devuelve shares outgoing con resources +
//            invitee_email + status derivado.
//   DELETE:  401, 404 si no existe / no es del owner, 200 setea revoked_at.
//   PATCH:   401, 404, 400 body inválido, 400 si share revocado, 200 update.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { createClientMock, adminGetUserByIdMock, getUserPlanMock } = vi.hoisted(() => ({
  createClientMock:     vi.fn(),
  adminGetUserByIdMock: vi.fn(),
  getUserPlanMock:      vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    auth: { admin: { getUserById: adminGetUserByIdMock } },
  },
}))

vi.mock('@/lib/subscription', () => ({
  getUserPlan: getUserPlanMock,
}))

import { POST, GET } from '@/app/api/shares/route'
import { DELETE, PATCH } from '@/app/api/shares/[id]/route'

// ─── Helper para construir un mock supabase con responses por tabla y operación ─
type Resp = { data: unknown; error: unknown }
type TableMap = Record<string, Resp | { insert?: Resp; update?: Resp; delete?: Resp; select?: Resp }>

function buildSupabase(tables: TableMap) {
  function pickResp(tableName: string, op: 'insert'|'update'|'delete'|'select'): Resp {
    const entry = tables[tableName]
    if (!entry) return { data: null, error: null }
    if ('data' in entry) return entry as Resp
    const opResp = (entry as Record<string, Resp | undefined>)[op]
    return opResp ?? { data: null, error: null }
  }

  function chain(tableName: string) {
    let pendingOp: 'insert'|'update'|'delete'|'select' = 'select'
    const c: Record<string, unknown> = {}
    for (const m of ['select','eq','neq','in','order','limit','range','not','is','or','filter','match']) {
      c[m] = vi.fn(() => c)
    }
    c.insert = vi.fn(() => { pendingOp = 'insert'; return c })
    c.update = vi.fn(() => { pendingOp = 'update'; return c })
    c.delete = vi.fn(() => { pendingOp = 'delete'; return c })
    c.upsert = vi.fn(() => { pendingOp = 'insert'; return c })
    c.single      = vi.fn(() => Promise.resolve(pickResp(tableName, pendingOp)))
    c.maybeSingle = vi.fn(() => Promise.resolve(pickResp(tableName, pendingOp)))
    c.then = (cb: (v: Resp) => unknown) => Promise.resolve(pickResp(tableName, pendingOp)).then(cb)
    return c
  }

  return {
    from: vi.fn((t: string) => chain(t)),
  } as unknown as {
    from: (t: string) => Record<string, unknown>
  }
}

function makeReq(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ME = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  createClientMock.mockReset()
  adminGetUserByIdMock.mockReset()
  getUserPlanMock.mockReset()
})

// ───────────────────────────────────────────────────────────────────────────
describe('POST /api/shares', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await POST(makeReq('http://localhost/api/shares', 'POST', { role: 'viewer', resources: {} }))
    expect(res.status).toBe(401)
  })

  it('403 si user no es Pro', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({}),
    })
    getUserPlanMock.mockResolvedValueOnce({ has_pro_access: false })

    const res = await POST(makeReq('http://localhost/api/shares', 'POST', {
      role: 'viewer', resources: { cuentas: ['cta_1'] },
    }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('requires_pro')
  })

  it('400 con role inválido', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({}),
    })
    getUserPlanMock.mockResolvedValueOnce({ has_pro_access: true })

    const res = await POST(makeReq('http://localhost/api/shares', 'POST', {
      role: 'admin', resources: { cuentas: ['cta_1'] },
    }))
    expect(res.status).toBe(400)
  })

  it('400 sin resources', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({}),
    })
    getUserPlanMock.mockResolvedValueOnce({ has_pro_access: true })

    const res = await POST(makeReq('http://localhost/api/shares', 'POST', { role: 'viewer' }))
    expect(res.status).toBe(400)
  })

  it('400 si todos los arrays están vacíos (no recursos)', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({}),
    })
    getUserPlanMock.mockResolvedValueOnce({ has_pro_access: true })

    const res = await POST(makeReq('http://localhost/api/shares', 'POST', {
      role: 'viewer',
      resources: { cuentas: [], gastos_fijos: [], inversiones: [] },
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/al menos un recurso/i)
  })

  it('400 si una cuenta no pertenece al user', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      // Pedimos 2 cuentas, validación devuelve solo 1 (la otra no es del owner).
      supabase: buildSupabase({
        cuentas: { data: [{ id: 'cta_1' }], error: null },
      }),
    })
    getUserPlanMock.mockResolvedValueOnce({ has_pro_access: true })

    const res = await POST(makeReq('http://localhost/api/shares', 'POST', {
      role: 'viewer',
      resources: { cuentas: ['cta_1', 'cta_2'] },
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cuenta no es tuya/i)
  })

  it('happy path: 200 con share creado + resources insertados', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        cuentas:         { data: [{ id: 'cta_1' }], error: null },
        gastos_fijos:    { data: [{ id: 'gf-1' }], error: null },
        inversiones:     { data: [],               error: null },
        shares:          {
          insert: { data: { id: 'share-new', invite_token: 'tok', role: 'editor', invited_at: '2026-05-25', expires_at: '2026-06-01' }, error: null },
        },
        share_resources: { insert: { data: null, error: null } },
      }),
    })
    getUserPlanMock.mockResolvedValueOnce({ has_pro_access: true })

    const res = await POST(makeReq('http://localhost/api/shares', 'POST', {
      role: 'editor',
      resources: { cuentas: ['cta_1'], gastos_fijos: ['gf-1'], inversiones: [] },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.id).toBe('share-new')
    expect(body.role).toBe('editor')
    expect(body.invite_url).toMatch(/\/invite\/tok$/)
    expect(body.resources.cuentas).toEqual(['cta_1'])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('GET /api/shares', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await GET(makeReq('http://localhost/api/shares', 'GET'))
    expect(res.status).toBe(401)
  })

  it('devuelve shares con resources + status', async () => {
    const sharesRow = {
      id: 'share-1',
      invitee_user_id: 'invitee-x',
      invite_token: 'tok-abc',
      role: 'viewer',
      invited_at: '2026-05-01',
      expires_at: '2026-06-01',
      accepted_at: '2026-05-10',
      revoked_at: null,
      share_resources: [
        { resource_type: 'cuenta',     resource_id: 'cta_1' },
        { resource_type: 'gasto_fijo', resource_id: 'gf-1'  },
      ],
    }
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { data: [sharesRow], error: null },
      }),
    })
    adminGetUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'invitee@x.com' } }, error: null })

    const res = await GET(makeReq('http://localhost/api/shares', 'GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shares).toHaveLength(1)
    expect(body.shares[0].invitee_email).toBe('invitee@x.com')
    expect(body.shares[0].status).toBe('active')
    expect(body.shares[0].resources.cuentas).toEqual(['cta_1'])
    expect(body.shares[0].resources.gastos_fijos).toEqual(['gf-1'])
  })

  it('status revoked si revoked_at presente', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          data: [{
            id: 's', invitee_user_id: null, invite_token: 't', role: 'viewer',
            invited_at: '2026-05-01', expires_at: '2026-06-01',
            accepted_at: null, revoked_at: '2026-05-02', share_resources: [],
          }],
          error: null,
        },
      }),
    })

    const res = await GET(makeReq('http://localhost/api/shares', 'GET'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('revoked')
  })

  it('status pending si no aceptado y no expirado', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          data: [{
            id: 's', invitee_user_id: null, invite_token: 't', role: 'viewer',
            invited_at: '2026-05-01', expires_at: future,
            accepted_at: null, revoked_at: null, share_resources: [],
          }],
          error: null,
        },
      }),
    })

    const res = await GET(makeReq('http://localhost/api/shares', 'GET'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('pending')
  })

  it('status expired si pasó expires_at sin aceptar', async () => {
    const past = '2020-01-01T00:00:00Z'
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          data: [{
            id: 's', invitee_user_id: null, invite_token: 't', role: 'viewer',
            invited_at: '2019-12-01', expires_at: past,
            accepted_at: null, revoked_at: null, share_resources: [],
          }],
          error: null,
        },
      }),
    })

    const res = await GET(makeReq('http://localhost/api/shares', 'GET'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('expired')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('DELETE /api/shares/[id]', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await DELETE(
      makeReq('http://localhost/api/shares/s1', 'DELETE'),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(401)
  })

  it('404 si update no devuelve filas (no es del owner / no existe)', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { update: { data: [], error: null } },
      }),
    })

    const res = await DELETE(
      makeReq('http://localhost/api/shares/s1', 'DELETE'),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(404)
  })

  it('200 setea revoked_at', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { update: { data: [{ id: 's1', revoked_at: '2026-05-25T12:00:00Z' }], error: null } },
      }),
    })

    const res = await DELETE(
      makeReq('http://localhost/api/shares/s1', 'DELETE'),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.revoked_at).toBe('2026-05-25T12:00:00Z')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('PATCH /api/shares/[id]', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', { role: 'editor' }),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(401)
  })

  it('400 sin campos para actualizar', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({}),
    })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', {}),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(400)
  })

  it('404 si share no existe / no del owner', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { select: { data: null, error: null } },
      }),
    })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', { role: 'editor' }),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(404)
  })

  it('400 si share revocado', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { select: { data: { id: 's1', revoked_at: '2026-05-01' }, error: null } },
      }),
    })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', { role: 'editor' }),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/revocado/i)
  })

  it('200 update role solo', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: {
          select: { data: { id: 's1', revoked_at: null }, error: null },
          update: { data: null, error: null },
        },
      }),
    })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', { role: 'editor' }),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('400 con role inválido', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({}),
    })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', { role: 'superadmin' }),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(400)
  })

  it('200 update resources reemplaza la lista', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        shares: { select: { data: { id: 's1', revoked_at: null }, error: null } },
        cuentas: { data: [{ id: 'cta_1' }, { id: 'cta_2' }], error: null },
        gastos_fijos: { data: [], error: null },
        inversiones: { data: [], error: null },
        share_resources: { delete: { data: null, error: null }, insert: { data: null, error: null } },
      }),
    })
    const res = await PATCH(
      makeReq('http://localhost/api/shares/s1', 'PATCH', {
        resources: { cuentas: ['cta_1', 'cta_2'], gastos_fijos: [], inversiones: [] },
      }),
      { params: Promise.resolve({ id: 's1' }) },
    )
    expect(res.status).toBe(200)
  })
})
