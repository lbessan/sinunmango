// Tests para /api/account-shares (POST/GET) + [id] (DELETE) + /incoming (GET).
//
// Cubrimos:
//   - POST: 401 sin auth, 403 sin Pro, 400 validación de body, 404 cuenta no
//     tuya, happy path con shape correcto (id, invite_token, invite_url)
//   - GET (outgoing): 401, lista enriquecida con cuenta_nombre + invitee_email
//     + status derivado (pending/active/expired/revoked)
//   - DELETE: 401, idempotente, 404 si no existe o no es tuyo
//   - incoming GET: 401, lista solo aceptados + no revocados

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, adminFromMock, getUserByIdMock, getUserPlanMock } = vi.hoisted(() => ({
  createClientMock:    vi.fn(),
  adminFromMock:       vi.fn(),
  getUserByIdMock:     vi.fn(),
  getUserPlanMock:     vi.fn(),
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
vi.mock('@/lib/subscription', () => ({
  getUserPlan: getUserPlanMock,
}))

import { POST, GET } from '@/app/api/account-shares/route'
import { DELETE }    from '@/app/api/account-shares/[id]/route'
import { GET as GET_INCOMING } from '@/app/api/account-shares/incoming/route'

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  createClientMock.mockReset()
  adminFromMock.mockReset()
  getUserByIdMock.mockReset()
  getUserPlanMock.mockReset()

  // Defaults: Pro user
  getUserPlanMock.mockResolvedValue({
    plan: 'pro', plan_expires_at: '2099-01-01', has_pro_access: true,
  })
})

// ── POST /api/account-shares ───────────────────────────────────────────────
describe('POST /api/account-shares', () => {
  function setupUser(user: { id: string } | null) {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user })
  }

  function setupSupabase(opts: {
    user: { id: string } | null
    cuentaLookup?: { data?: unknown; error?: unknown }
    insertResult?: { data?: unknown; error?: unknown }
  }) {
    const single = vi.fn(() => Promise.resolve({
      data: opts.insertResult?.data,
      error: opts.insertResult?.error ?? null,
    }))
    const selectAfterInsert = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select: selectAfterInsert }))

    const maybeSingle = vi.fn(() => Promise.resolve({
      data: opts.cuentaLookup?.data ?? null,
      error: opts.cuentaLookup?.error ?? null,
    }))
    const eq2 = vi.fn(() => ({ maybeSingle }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))

    const from = vi.fn((table: string) => {
      if (table === 'cuentas') return { select }
      if (table === 'account_shares') return { insert }
      throw new Error(`Tabla inesperada: ${table}`)
    })

    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
    return { insert }
  }

  it('401 sin user', async () => {
    setupUser(null)
    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta_1', role: 'editor',
    }))
    expect(res.status).toBe(401)
  })

  it('403 si user no es Pro (Free)', async () => {
    setupUser({ id: 'u1' })
    getUserPlanMock.mockResolvedValueOnce({
      plan: 'free', plan_expires_at: null, has_pro_access: false,
    })
    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta_1', role: 'editor',
    }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('requires_pro')
  })

  it('400 si JSON inválido', async () => {
    setupUser({ id: 'u1' })
    const r = new NextRequest('http://localhost/api/account-shares', {
      method: 'POST', body: 'xxx',
    })
    const res = await POST(r)
    expect(res.status).toBe(400)
  })

  it('400 si falta cuenta_id', async () => {
    setupUser({ id: 'u1' })
    const res = await POST(req('POST', '/api/account-shares', { role: 'editor' }))
    expect(res.status).toBe(400)
  })

  it('400 si role no es viewer|editor', async () => {
    setupUser({ id: 'u1' })
    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta_1', role: 'admin',
    }))
    expect(res.status).toBe(400)
  })

  it('404 si la cuenta no existe o no es del user', async () => {
    setupSupabase({
      user: { id: 'u1' },
      cuentaLookup: { data: null },
    })
    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta_de_otro', role: 'editor',
    }))
    expect(res.status).toBe(404)
  })

  it('happy path: devuelve invite_token + invite_url + expires_at', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
    setupSupabase({
      user: { id: 'u1' },
      cuentaLookup: { data: { id: 'cta_galicia', user_id: 'u1', nombre_cuenta: 'Galicia' } },
      insertResult: {
        data: {
          id: 'share_1',
          invite_token: 'abc123def456abc123def456abc123ff',  // 32 hex
          role: 'editor',
          invited_at: '2026-05-25T00:00:00Z',
          expires_at: '2026-06-01T00:00:00Z',
        },
      },
    })
    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta_galicia', role: 'editor',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.id).toBe('share_1')
    expect(body.invite_token).toMatch(/^[a-f0-9]{32}$/)
    expect(body.invite_url).toBe(`https://app.example.com/invite/${body.invite_token}`)
    expect(body.role).toBe('editor')
    expect(body.expires_at).toBeDefined()
    expect(body.cuenta).toEqual({ id: 'cta_galicia', nombre: 'Galicia' })
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('invite_url cae a default si NEXT_PUBLIC_APP_URL no está seteada', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    setupSupabase({
      user: { id: 'u1' },
      cuentaLookup: { data: { id: 'cta', user_id: 'u1', nombre_cuenta: 'X' } },
      insertResult: {
        data: { id: 's', invite_token: 'a'.repeat(32), role: 'viewer',
          invited_at: 'x', expires_at: 'y' },
      },
    })
    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta', role: 'viewer',
    }))
    const body = await res.json()
    expect(body.invite_url).toContain('https://app.sinunmango.com.ar/invite/')
  })

  it('500 si insert falla en DB', async () => {
    setupSupabase({
      user: { id: 'u1' },
      cuentaLookup: { data: { id: 'cta', user_id: 'u1', nombre_cuenta: 'X' } },
      insertResult: { error: { message: 'db down' } },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req('POST', '/api/account-shares', {
      cuenta_id: 'cta', role: 'viewer',
    }))
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })
})

// ── GET /api/account-shares (outgoing) ─────────────────────────────────────
describe('GET /api/account-shares (outgoing)', () => {
  function setupListing(opts: {
    user: { id: string } | null
    shares?: Array<Record<string, unknown>>
    error?: unknown
  }) {
    const order = vi.fn(() => Promise.resolve({
      data: opts.shares ?? [], error: opts.error ?? null,
    }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  }

  it('401 sin user', async () => {
    setupListing({ user: null })
    const res = await GET(req('GET', '/api/account-shares'))
    expect(res.status).toBe(401)
  })

  it('lista vacía → shares=[]', async () => {
    setupListing({ user: { id: 'u' }, shares: [] })
    const res = await GET(req('GET', '/api/account-shares'))
    const body = await res.json()
    expect(body.shares).toEqual([])
  })

  it('status=pending para share sin accepted_at + dentro del expiry', async () => {
    const future = new Date(Date.now() + 24 * 3600_000).toISOString()
    setupListing({
      user: { id: 'u' },
      shares: [{
        id: 's1', cuenta_id: 'cta', invitee_user_id: null,
        invite_token: 't', role: 'editor',
        invited_at: 'x', expires_at: future,
        accepted_at: null, revoked_at: null,
        cuentas: { nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA' },
      }],
    })

    const res = await GET(req('GET', '/api/account-shares'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('pending')
    expect(body.shares[0].cuenta_nombre).toBe('Galicia')
    expect(body.shares[0].invitee_email).toBeNull()
  })

  it('status=active si accepted_at seteado', async () => {
    setupListing({
      user: { id: 'u' },
      shares: [{
        id: 's1', cuenta_id: 'cta', invitee_user_id: 'invitee_x',
        invite_token: 't', role: 'editor',
        invited_at: 'x', expires_at: 'y',
        accepted_at: '2026-05-20T00:00:00Z', revoked_at: null,
        cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' },
      }],
    })
    getUserByIdMock.mockResolvedValueOnce({
      data: { user: { email: 'invitee@example.com' } }, error: null,
    })

    const res = await GET(req('GET', '/api/account-shares'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('active')
    expect(body.shares[0].invitee_email).toBe('invitee@example.com')
  })

  it('status=expired si expires_at en el pasado y no aceptado', async () => {
    const past = new Date(Date.now() - 24 * 3600_000).toISOString()
    setupListing({
      user: { id: 'u' },
      shares: [{
        id: 's1', cuenta_id: 'cta', invitee_user_id: null,
        invite_token: 't', role: 'viewer',
        invited_at: 'x', expires_at: past,
        accepted_at: null, revoked_at: null,
        cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
      }],
    })
    const res = await GET(req('GET', '/api/account-shares'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('expired')
  })

  it('status=revoked > status=accepted (precedencia)', async () => {
    setupListing({
      user: { id: 'u' },
      shares: [{
        id: 's1', cuenta_id: 'cta', invitee_user_id: 'inv',
        invite_token: 't', role: 'editor',
        invited_at: 'x', expires_at: 'y',
        accepted_at: '2026-05-20T00:00:00Z',
        revoked_at:  '2026-05-25T00:00:00Z',
        cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
      }],
    })
    getUserByIdMock.mockResolvedValueOnce({
      data: { user: { email: 'a@b.com' } }, error: null,
    })

    const res = await GET(req('GET', '/api/account-shares'))
    const body = await res.json()
    expect(body.shares[0].status).toBe('revoked')
  })

  it('500 si query falla', async () => {
    setupListing({ user: { id: 'u' }, error: { message: 'db' } })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req('GET', '/api/account-shares'))
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })

  it('getUserById que falla → invitee_email=null pero no rompe', async () => {
    setupListing({
      user: { id: 'u' },
      shares: [{
        id: 's1', cuenta_id: 'cta', invitee_user_id: 'eliminado',
        invite_token: 't', role: 'editor',
        invited_at: 'x', expires_at: 'y',
        accepted_at: '2026-05-20T00:00:00Z', revoked_at: null,
        cuentas: { nombre_cuenta: 'X', tipo_cuenta: 'X' },
      }],
    })
    getUserByIdMock.mockRejectedValueOnce(new Error('not found'))

    const res = await GET(req('GET', '/api/account-shares'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shares[0].invitee_email).toBeNull()
  })
})

// ── DELETE /api/account-shares/[id] ────────────────────────────────────────
describe('DELETE /api/account-shares/[id]', () => {
  function setupDelete(opts: {
    user: { id: string } | null
    updateResult?: { data?: unknown[]; error?: unknown }
  }) {
    const select = vi.fn(() => Promise.resolve({
      data: opts.updateResult?.data ?? [],
      error: opts.updateResult?.error ?? null,
    }))
    const eq2 = vi.fn(() => ({ select }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const update = vi.fn(() => ({ eq: eq1 }))
    const from = vi.fn(() => ({ update }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  }

  it('401 sin user', async () => {
    setupDelete({ user: null })
    const res = await DELETE(req('DELETE', '/api/account-shares/x'), {
      params: Promise.resolve({ id: 'x' }),
    })
    expect(res.status).toBe(401)
  })

  it('404 si el share no existe o no es del owner', async () => {
    setupDelete({ user: { id: 'u' }, updateResult: { data: [] } })
    const res = await DELETE(req('DELETE', '/api/account-shares/x'), {
      params: Promise.resolve({ id: 'x' }),
    })
    expect(res.status).toBe(404)
  })

  it('happy path: 200 con revoked_at', async () => {
    setupDelete({
      user: { id: 'u' },
      updateResult: { data: [{ id: 's1', revoked_at: '2026-05-25T00:00:00Z' }] },
    })
    const res = await DELETE(req('DELETE', '/api/account-shares/s1'), {
      params: Promise.resolve({ id: 's1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.revoked_at).toBe('2026-05-25T00:00:00Z')
  })

  it('500 si update tira error', async () => {
    setupDelete({ user: { id: 'u' }, updateResult: { error: { message: 'db' } } })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await DELETE(req('DELETE', '/api/account-shares/x'), {
      params: Promise.resolve({ id: 'x' }),
    })
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })
})

// ── GET /api/account-shares/incoming ───────────────────────────────────────
describe('GET /api/account-shares/incoming', () => {
  function setupIncoming(opts: {
    user: { id: string } | null
    shares?: Array<Record<string, unknown>>
    error?: unknown
  }) {
    const order = vi.fn(() => Promise.resolve({
      data: opts.shares ?? [], error: opts.error ?? null,
    }))
    const isNull = vi.fn(() => ({ order }))
    const notNull = vi.fn(() => ({ is: isNull }))
    const eq = vi.fn(() => ({ not: notNull }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  }

  it('401 sin user', async () => {
    setupIncoming({ user: null })
    const res = await GET_INCOMING(req('GET', '/api/account-shares/incoming'))
    expect(res.status).toBe(401)
  })

  it('lista vacía si no hay shares conmigo', async () => {
    setupIncoming({ user: { id: 'u' }, shares: [] })
    const res = await GET_INCOMING(req('GET', '/api/account-shares/incoming'))
    const body = await res.json()
    expect(body.shares).toEqual([])
  })

  it('lista shares enriquecidos con owner_email + cuenta info', async () => {
    setupIncoming({
      user: { id: 'invitee' },
      shares: [{
        id: 's1', cuenta_id: 'cta_g', owner_user_id: 'owner_uuid',
        role: 'editor', accepted_at: '2026-05-20T00:00:00Z',
        cuentas: { nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA', moneda: 'ARS' },
      }],
    })
    getUserByIdMock.mockResolvedValueOnce({
      data: { user: { email: 'lucho@example.com' } }, error: null,
    })

    const res = await GET_INCOMING(req('GET', '/api/account-shares/incoming'))
    const body = await res.json()
    expect(body.shares[0].owner_email).toBe('lucho@example.com')
    expect(body.shares[0].cuenta_nombre).toBe('Galicia')
    expect(body.shares[0].role).toBe('editor')
  })

  it('múltiples shares del mismo owner → 1 sola llamada a getUserById', async () => {
    setupIncoming({
      user: { id: 'invitee' },
      shares: [
        { id: 's1', cuenta_id: 'a', owner_user_id: 'owner1', role: 'editor',
          accepted_at: 'x', cuentas: { nombre_cuenta: 'A' } },
        { id: 's2', cuenta_id: 'b', owner_user_id: 'owner1', role: 'viewer',
          accepted_at: 'y', cuentas: { nombre_cuenta: 'B' } },
      ],
    })
    getUserByIdMock.mockResolvedValueOnce({
      data: { user: { email: 'o@x.com' } }, error: null,
    })

    const res = await GET_INCOMING(req('GET', '/api/account-shares/incoming'))
    expect(res.status).toBe(200)
    // Solo se llama una vez al lookup de owner (deduplicación por Set)
    expect(getUserByIdMock).toHaveBeenCalledTimes(1)
  })
})
