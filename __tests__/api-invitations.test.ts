// Tests para /api/invitations/[token]
//
// GET (preview público):
//   - 400 con token mal formado
//   - 404 si no existe
//   - 200 con status calculado: pending / active / expired / revoked
//   - 200 con owner_email + counts de resources
//
// POST (aceptar — requiere auth):
//   - 401 sin auth
//   - 400 token mal formado
//   - 404 si invitación no existe
//   - 400 si owner_user_id === user.id (self-accept)
//   - 410 si revocada
//   - 410 si expirada
//   - 200 idempotente si yo ya la acepté
//   - 409 si la aceptó otro user
//   - 409 si ya tengo OTRO share activo con el mismo owner
//   - 200 happy path: setea invitee_user_id + accepted_at

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, adminMock, getUserByIdMock } = vi.hoisted(() => {
  return {
    createClientMock: vi.fn(),
    adminMock: {
      _shares: null as unknown,
      _resources: [] as Array<{ resource_type: string }>,
      _existingShareWithSameOwner: null as unknown,
      _updateError: null as unknown,
    },
    getUserByIdMock: vi.fn(),
  }
})

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/supabase/admin', () => {
  // Chain stateful: la PRIMERA query a shares devuelve _shares (con resources
  // inyectados); la SEGUNDA (.eq('owner_user_id').eq('invitee_user_id'))
  // devuelve _existingShareWithSameOwner; los update() devuelven _updateError.
  function makeChain() {
    let calls = 0
    let isUpdate = false
    const c: Record<string, unknown> = {}
    for (const m of ['select','neq','in','order','limit','is','not']) {
      c[m] = vi.fn(() => c)
    }
    c.eq     = vi.fn(() => { calls++; return c })
    c.update = vi.fn(() => { isUpdate = true; return c })
    c.delete = vi.fn(() => { isUpdate = true; return c })
    c.maybeSingle = vi.fn(() => {
      if (isUpdate) return Promise.resolve({ data: null, error: adminMock._updateError })
      // 1ra invocación = lookup por token → _shares.
      // 2da = lookup de existing share por (owner, invitee) → _existingShareWithSameOwner.
      const data = calls <= 1 ? adminMock._shares : adminMock._existingShareWithSameOwner
      return Promise.resolve({ data, error: null })
    })
    c.single = c.maybeSingle
    c.then = (cb: (v: { data: unknown; error: unknown }) => unknown) => {
      if (isUpdate) {
        return Promise.resolve({ data: null, error: adminMock._updateError }).then(cb)
      }
      return Promise.resolve({ data: adminMock._shares, error: null }).then(cb)
    }
    return c
  }
  return {
    adminClient: {
      from: vi.fn(() => makeChain()),
      auth: { admin: { getUserById: getUserByIdMock } },
    },
  }
})

import { GET, POST } from '@/app/api/invitations/[token]/route'

const TOKEN  = 'a'.repeat(32)        // 32 hex chars válido
const OWNER  = '22222222-2222-2222-2222-222222222222'
const ME     = '11111111-1111-1111-1111-111111111111'
const OTHER  = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  createClientMock.mockReset()
  getUserByIdMock.mockReset()
  adminMock._shares = null
  adminMock._resources = []
  adminMock._existingShareWithSameOwner = null
  adminMock._updateError = null
})

function makeReq(method: string) {
  return new NextRequest(`http://localhost/api/invitations/${TOKEN}`, { method })
}

// ─── GET ────────────────────────────────────────────────────────────────────
describe('GET /api/invitations/[token]', () => {
  it('400 si token mal formado', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/invitations/bad'),
      { params: Promise.resolve({ token: 'bad' }) },
    )
    expect(res.status).toBe(400)
  })

  it('404 si no existe', async () => {
    adminMock._shares = null
    const res = await GET(makeReq('GET'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(404)
  })

  it('pending: no aceptada, no revocada, no expirada', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null, role: 'viewer',
      invited_at: '2026-05-01', expires_at: future,
      accepted_at: null, revoked_at: null,
      share_resources: [
        { resource_type: 'cuenta' },
        { resource_type: 'cuenta' },
        { resource_type: 'gasto_fijo' },
      ],
    }
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'o@x.com' } }, error: null })

    const res = await GET(makeReq('GET'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.role).toBe('viewer')
    expect(body.owner_email).toBe('o@x.com')
    expect(body.counts).toEqual({ cuentas: 2, gastos_fijos: 1, inversiones: 0 })
  })

  it('active si accepted_at presente', async () => {
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: ME, role: 'editor',
      invited_at: '2026-05-01', expires_at: '2026-06-01',
      accepted_at: '2026-05-02', revoked_at: null,
      share_resources: [],
    }
    const res = await GET(makeReq('GET'), { params: Promise.resolve({ token: TOKEN }) })
    const body = await res.json()
    expect(body.status).toBe('active')
  })

  it('revoked si revoked_at presente', async () => {
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null, role: 'viewer',
      invited_at: '2026-05-01', expires_at: '2026-06-01',
      accepted_at: null, revoked_at: '2026-05-03',
      share_resources: [],
    }
    const res = await GET(makeReq('GET'), { params: Promise.resolve({ token: TOKEN }) })
    const body = await res.json()
    expect(body.status).toBe('revoked')
  })

  it('expired si pasó expires_at sin aceptar', async () => {
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null, role: 'viewer',
      invited_at: '2020-12-01', expires_at: '2020-12-31',
      accepted_at: null, revoked_at: null,
      share_resources: [],
    }
    const res = await GET(makeReq('GET'), { params: Promise.resolve({ token: TOKEN }) })
    const body = await res.json()
    expect(body.status).toBe('expired')
  })

  it('owner_email null si lookup falla', async () => {
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null, role: 'viewer',
      invited_at: '2026-05-01', expires_at: '2026-06-01',
      accepted_at: null, revoked_at: null, share_resources: [],
    }
    getUserByIdMock.mockRejectedValueOnce(new Error('admin api down'))

    const res = await GET(makeReq('GET'), { params: Promise.resolve({ token: TOKEN }) })
    const body = await res.json()
    expect(body.owner_email).toBeNull()
  })
})

// ─── POST (accept) ──────────────────────────────────────────────────────────
describe('POST /api/invitations/[token]', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null })
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(401)
  })

  it('400 token mal formado', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: 'bad' }) })
    expect(res.status).toBe(400)
  })

  it('404 invitación no existe', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = null

    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(404)
  })

  it('400 si owner_user_id === user.id (self-accept)', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: ME, invitee_user_id: null,
      accepted_at: null, revoked_at: null,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/propio workspace/i)
  })

  it('410 si revocada', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null,
      accepted_at: null, revoked_at: '2026-05-01',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(410)
  })

  it('410 si expirada', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null,
      accepted_at: null, revoked_at: null,
      expires_at: '2020-01-01T00:00:00Z',
    }
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(410)
  })

  it('200 idempotente si YO ya la acepté', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: ME,
      accepted_at: '2026-05-02', revoked_at: null,
      expires_at: '2026-06-01',
    }
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.already_accepted).toBe(true)
    expect(body.owner_user_id).toBe(OWNER)
  })

  it('409 si OTRO user la aceptó', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: OTHER,
      accepted_at: '2026-05-02', revoked_at: null,
      expires_at: '2026-06-01',
    }
    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(409)
  })

  it('409 si ya tengo otro share activo con el mismo owner', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null,
      accepted_at: null, revoked_at: null,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }
    // Lookup secundario devuelve otro share con el mismo owner.
    adminMock._existingShareWithSameOwner = { id: 'otro-share' }

    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/otra invitación/i)
  })

  it('200 happy path: setea invitee_user_id + accepted_at', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME } })
    adminMock._shares = {
      id: 's1', owner_user_id: OWNER, invitee_user_id: null,
      accepted_at: null, revoked_at: null,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }
    adminMock._existingShareWithSameOwner = null
    adminMock._updateError = null

    const res = await POST(makeReq('POST'), { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.owner_user_id).toBe(OWNER)
  })
})
