// Tests para /api/invitations/[token] (GET preview + POST accept)
//
// Cubrimos:
//   - GET: validación del token (32 hex), 404 si no existe, status derivado
//     (pending/active/expired/revoked), enrichment con owner_email
//   - POST: 401 sin auth, 400 token inválido, 400 self-invitation, 410
//     expirado/revocado, 409 ya aceptado por otro, 200 idempotente si
//     ya lo acepté yo, happy path con cuenta_id

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, adminFromMock, getUserByIdMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  adminFromMock:    vi.fn(),
  getUserByIdMock:  vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    from: adminFromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  },
}))

import { GET, POST } from '@/app/api/invitations/[token]/route'

const VALID_TOKEN = 'a'.repeat(32)  // 32 hex chars

function req(method: string, token: string): NextRequest {
  return new NextRequest(`http://localhost/api/invitations/${token}`, { method })
}
function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) }
}

beforeEach(() => {
  createClientMock.mockReset()
  adminFromMock.mockReset()
  getUserByIdMock.mockReset()
})

// ── GET /api/invitations/[token] ───────────────────────────────────────────
describe('GET /api/invitations/[token]', () => {
  function setupLookup(share: Record<string, unknown> | null) {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: share, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    adminFromMock.mockReturnValueOnce({ select })
  }

  it('400 si el token no es 32 hex chars', async () => {
    const res = await GET(req('GET', 'short-token'), paramsFor('short-token'))
    expect(res.status).toBe(400)
  })

  it('400 si el token tiene caracteres no-hex', async () => {
    const res = await GET(req('GET', 'xyz' + 'a'.repeat(29)), paramsFor('xyz' + 'a'.repeat(29)))
    expect(res.status).toBe(400)
  })

  it('404 si el token no existe en DB', async () => {
    setupLookup(null)
    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(404)
  })

  it('status=pending para invitación activa sin aceptar', async () => {
    const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString()
    setupLookup({
      id: 's1', cuenta_id: 'cta', owner_user_id: 'owner', invitee_user_id: null,
      role: 'editor', invited_at: 'x', expires_at: future,
      accepted_at: null, revoked_at: null,
      cuentas: { nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA' },
    })
    getUserByIdMock.mockResolvedValueOnce({
      data: { user: { email: 'owner@x.com' } }, error: null,
    })

    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.cuenta_nombre).toBe('Galicia')
    expect(body.owner_email).toBe('owner@x.com')
    expect(body.role).toBe('editor')
  })

  it('status=expired si expires_at en el pasado', async () => {
    const past = new Date(Date.now() - 24 * 3600_000).toISOString()
    setupLookup({
      id: 's1', cuenta_id: 'cta', owner_user_id: 'owner', invitee_user_id: null,
      role: 'viewer', invited_at: 'x', expires_at: past,
      accepted_at: null, revoked_at: null,
      cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: null }, error: null })

    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    const body = await res.json()
    expect(body.status).toBe('expired')
  })

  it('status=active si ya fue aceptada', async () => {
    setupLookup({
      id: 's1', cuenta_id: 'cta', owner_user_id: 'owner', invitee_user_id: 'inv',
      role: 'editor', invited_at: 'x',
      expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      accepted_at: '2026-05-20T00:00:00Z', revoked_at: null,
      cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: null }, error: null })

    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    const body = await res.json()
    expect(body.status).toBe('active')
  })

  it('status=revoked > active (revoked tiene prioridad)', async () => {
    setupLookup({
      id: 's1', cuenta_id: 'cta', owner_user_id: 'owner', invitee_user_id: 'inv',
      role: 'editor', invited_at: 'x',
      expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      accepted_at: '2026-05-20T00:00:00Z',
      revoked_at:  '2026-05-25T00:00:00Z',
      cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: null }, error: null })

    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    const body = await res.json()
    expect(body.status).toBe('revoked')
  })

  it('owner_email queda null si getUserById falla', async () => {
    setupLookup({
      id: 's1', cuenta_id: 'cta', owner_user_id: 'eliminado', invitee_user_id: null,
      role: 'viewer', invited_at: 'x',
      expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      accepted_at: null, revoked_at: null,
      cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
    })
    getUserByIdMock.mockRejectedValueOnce(new Error('not found'))

    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.owner_email).toBeNull()
  })

  it('NO expone owner_user_id ni invitee_user_id ni share id', async () => {
    setupLookup({
      id: 's_internal', cuenta_id: 'cta', owner_user_id: 'owner_secret',
      invitee_user_id: 'inv_secret', role: 'editor', invited_at: 'x',
      expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      accepted_at: null, revoked_at: null,
      cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
    })
    getUserByIdMock.mockResolvedValueOnce({ data: { user: null }, error: null })

    const res = await GET(req('GET', VALID_TOKEN), paramsFor(VALID_TOKEN))
    const body = await res.json()
    expect(body.id).toBeUndefined()
    expect(body.owner_user_id).toBeUndefined()
    expect(body.invitee_user_id).toBeUndefined()
  })
})

// ── POST /api/invitations/[token] (accept) ─────────────────────────────────
describe('POST /api/invitations/[token] (accept)', () => {
  function setupShareAndUpdate(opts: {
    user:     { id: string } | null
    share?:   Record<string, unknown> | null
    existing?: Record<string, unknown> | null
    updErr?:  unknown
  }) {
    // Lookup del share
    const shareMaybeSingle = vi.fn(() => Promise.resolve({
      data:  opts.share ?? null, error: null,
    }))
    const shareEq    = vi.fn(() => ({ maybeSingle: shareMaybeSingle }))
    const shareSel   = vi.fn(() => ({ eq: shareEq }))

    // Lookup de existing (cuenta_id + invitee_user_id activo) — solo si pasa el share
    const existingMS = vi.fn(() => Promise.resolve({
      data: opts.existing ?? null, error: null,
    }))
    const existingIs = vi.fn(() => ({ maybeSingle: existingMS }))
    const existingEq2 = vi.fn(() => ({ is: existingIs }))
    const existingEq1 = vi.fn(() => ({ eq: existingEq2 }))
    const existingSel = vi.fn(() => ({ eq: existingEq1 }))

    // Update del share
    const updateEq = vi.fn(() => Promise.resolve({ error: opts.updErr ?? null }))
    const update   = vi.fn(() => ({ eq: updateEq }))

    let fromCallCount = 0
    adminFromMock.mockImplementation((table: string) => {
      if (table !== 'account_shares') throw new Error(`tabla inesperada: ${table}`)
      fromCallCount++
      if (fromCallCount === 1) return { select: shareSel }
      if (fromCallCount === 2) return { select: existingSel }
      return { update }
    })

    createClientMock.mockResolvedValueOnce({ supabase: {}, user: opts.user })
  }

  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(401)
  })

  it('400 si token inválido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req('POST', 'short'), paramsFor('short'))
    expect(res.status).toBe(400)
  })

  it('404 si el share no existe', async () => {
    setupShareAndUpdate({ user: { id: 'u' }, share: null })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(404)
  })

  it('400 si el user es el owner (no podés aceptarte a vos mismo)', async () => {
    setupShareAndUpdate({
      user: { id: 'owner_uuid' },
      share: {
        id: 's', owner_user_id: 'owner_uuid', invitee_user_id: null,
        accepted_at: null, revoked_at: null,
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta',
      },
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('No podés aceptar')
  })

  it('410 si el share fue revocado', async () => {
    setupShareAndUpdate({
      user: { id: 'invitee' },
      share: {
        id: 's', owner_user_id: 'owner', invitee_user_id: null,
        accepted_at: null,
        revoked_at: '2026-05-25T00:00:00Z',
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta',
      },
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toContain('revocada')
  })

  it('410 si la invitación expiró', async () => {
    setupShareAndUpdate({
      user: { id: 'invitee' },
      share: {
        id: 's', owner_user_id: 'owner', invitee_user_id: null,
        accepted_at: null, revoked_at: null,
        expires_at: new Date(Date.now() - 24 * 3600_000).toISOString(),  // ayer
        cuenta_id: 'cta',
      },
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toContain('expiró')
  })

  it('200 idempotente: si ya la acepté yo antes, devuelve already_accepted=true', async () => {
    setupShareAndUpdate({
      user: { id: 'invitee' },
      share: {
        id: 's', owner_user_id: 'owner', invitee_user_id: 'invitee',
        accepted_at: '2026-05-20T00:00:00Z', revoked_at: null,
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta_g',
      },
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.already_accepted).toBe(true)
    expect(body.cuenta_id).toBe('cta_g')
  })

  it('409 si la acceptó otro user antes', async () => {
    setupShareAndUpdate({
      user: { id: 'me' },
      share: {
        id: 's', owner_user_id: 'owner', invitee_user_id: 'someone_else',
        accepted_at: '2026-05-20T00:00:00Z', revoked_at: null,
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta',
      },
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('otro usuario')
  })

  it('409 si ya tengo otro share activo para la misma cuenta', async () => {
    setupShareAndUpdate({
      user: { id: 'invitee' },
      share: {
        id: 's_new', owner_user_id: 'owner', invitee_user_id: null,
        accepted_at: null, revoked_at: null,
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta',
      },
      existing: { id: 's_old' },  // otro share activo conmigo + esta cuenta
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('otra invitación')
  })

  it('happy path: acepta, devuelve ok + cuenta_id', async () => {
    setupShareAndUpdate({
      user: { id: 'invitee' },
      share: {
        id: 's', owner_user_id: 'owner', invitee_user_id: null,
        accepted_at: null, revoked_at: null,
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta_galicia',
      },
    })
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.cuenta_id).toBe('cta_galicia')
  })

  it('500 si el update falla', async () => {
    setupShareAndUpdate({
      user: { id: 'invitee' },
      share: {
        id: 's', owner_user_id: 'owner', invitee_user_id: null,
        accepted_at: null, revoked_at: null,
        expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
        cuenta_id: 'cta',
      },
      updErr: { message: 'db down' },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req('POST', VALID_TOKEN), paramsFor(VALID_TOKEN))
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })
})
