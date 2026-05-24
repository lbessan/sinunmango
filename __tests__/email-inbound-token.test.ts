// Tests para /api/email-inbound-token (GET/POST/PATCH)
//
// Endpoint que maneja el token único de cada user para que reciba emails
// en `${token}@sinunmango.com.ar`. El token tiene formato `${prefix}-${4hex}`
// donde prefix viene del local part del email del user.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, adminFromMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  adminFromMock:    vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

import { GET, POST, PATCH } from '@/app/api/email-inbound-token/route'

function makeReq(method: string = 'GET'): NextRequest {
  return new NextRequest('http://localhost/api/email-inbound-token', { method })
}

type Setup = {
  user: { id: string; email?: string } | null
  /** Token existente para el user (GET path). */
  existingToken?: string | null
  existingCode?:  string | null
  /** Si admin lookup de token "ocupado" debe devolver true para los primeros N intentos. */
  adminCollisions?: number
}

function setup(opts: Setup) {
  // Cliente del usuario:
  // .from('user_preferences').select(...).eq('user_id', x).maybeSingle()
  const userMaybeSingle = vi.fn(() => Promise.resolve({
    data: opts.existingToken
      ? { email_inbound_token: opts.existingToken, gmail_verification_code: opts.existingCode ?? null }
      : null,
    error: null,
  }))
  const userEq = vi.fn(() => ({ maybeSingle: userMaybeSingle }))
  const userSelect = vi.fn(() => ({ eq: userEq }))
  // .from('user_preferences').upsert({...}, {...})
  const userUpsert = vi.fn(() => Promise.resolve({ error: null }))
  const userFrom = vi.fn(() => ({ select: userSelect, upsert: userUpsert }))

  createClientMock.mockResolvedValueOnce({ supabase: { from: userFrom }, user: opts.user })

  // Admin lookups durante generateTokenForUser (chequea colisiones).
  // Por cada intento, .from('user_preferences').select('user_id').eq().maybeSingle()
  let collisionsRemaining = opts.adminCollisions ?? 0
  const adminMaybeSingle = vi.fn(() => {
    if (collisionsRemaining > 0) {
      collisionsRemaining--
      return Promise.resolve({ data: { user_id: 'someone-else' }, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
  const adminEq = vi.fn(() => ({ maybeSingle: adminMaybeSingle }))
  const adminSelect = vi.fn(() => ({ eq: adminEq }))
  adminFromMock.mockReturnValue({ select: adminSelect })

  return { userUpsert, adminMaybeSingle }
}

beforeEach(() => {
  createClientMock.mockReset()
  adminFromMock.mockReset()
})

// ── GET ────────────────────────────────────────────────────────────────────
describe('GET /api/email-inbound-token', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('user tiene token existente → devuelve el token y el verification_code', async () => {
    setup({
      user: { id: 'u1', email: 'a@b.com' },
      existingToken: 'lucho-deadbeef',
      existingCode:  'VERIFIED',
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe('lucho-deadbeef')
    expect(body.gmail_verification_code).toBe('VERIFIED')
  })

  it('user tiene token pero gmail_verification_code es null → devuelve null', async () => {
    setup({
      user: { id: 'u1', email: 'a@b.com' },
      existingToken: 'lucho-deadbeef',
      existingCode: null,
    })
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.gmail_verification_code).toBeNull()
  })

  it('user sin token → genera uno nuevo, hace upsert, devuelve', async () => {
    const { userUpsert } = setup({
      user: { id: 'u1', email: 'lucho@gmail.com' },
      existingToken: null,
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toMatch(/^lucho-[a-f0-9]{8}$/)
    expect(body.gmail_verification_code).toBeNull()
    expect(userUpsert).toHaveBeenCalledTimes(1)
  })

  it('genera prefix desde local-part del email — saca puntos/symbols', async () => {
    setup({
      user: { id: 'u1', email: 'lucho.bessan+test@gmail.com' },
      existingToken: null,
    })
    const res = await GET(makeReq())
    const body = await res.json()
    // El punto y el + se sacan; el resultado debe empezar con "luchobessantest"
    expect(body.token).toMatch(/^luchobessantest-[a-f0-9]{8}$/)
  })

  it('prefix se trunca a 18 chars si es muy largo', async () => {
    setup({
      user: { id: 'u1', email: 'unemailmuylargoperomuylargo@test.com' },
      existingToken: null,
    })
    const res = await GET(makeReq())
    const body = await res.json()
    const prefix = body.token.split('-')[0]
    expect(prefix.length).toBeLessThanOrEqual(18)
  })

  it('user sin email → prefix default "user"', async () => {
    setup({
      user: { id: 'u1' },  // sin email
      existingToken: null,
    })
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.token).toMatch(/^user-[a-f0-9]{8}$/)
  })

  it('en caso de colisiones, sigue intentando hasta encontrar uno libre', async () => {
    const { adminMaybeSingle } = setup({
      user: { id: 'u1', email: 'a@b.com' },
      existingToken: null,
      adminCollisions: 2,  // primeros 2 candidatos colisionan, el 3ro pasa
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(adminMaybeSingle).toHaveBeenCalledTimes(3)
  })

  it('en caso de 5 colisiones seguidas → cae al random total (16 hex chars)', async () => {
    setup({
      user: { id: 'u1', email: 'a@b.com' },
      existingToken: null,
      adminCollisions: 5,  // las 5 iteraciones colisionan
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    // Token random total: 16 hex chars (8 bytes), sin prefix
    expect(body.token).toMatch(/^[a-f0-9]{32}$/)
  })
})

// ── POST (regenerar token) ─────────────────────────────────────────────────
describe('POST /api/email-inbound-token', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq('POST'))
    expect(res.status).toBe(401)
  })

  it('genera nuevo token + resetea gmail_verification_code a null', async () => {
    const { userUpsert } = setup({
      user: { id: 'u1', email: 'a@b.com' },
      existingToken: 'old-token',
    })

    const res = await POST(makeReq('POST'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toMatch(/^a-[a-f0-9]{8}$/)

    expect(userUpsert).toHaveBeenCalledTimes(1)
    const upsertArgs = userUpsert.mock.calls[0][0] as Record<string, unknown>
    expect(upsertArgs.email_inbound_token).toBe(body.token)
    expect(upsertArgs.gmail_verification_code).toBeNull()
    expect(upsertArgs.user_id).toBe('u1')
  })
})

// ── PATCH (marcar verificación Gmail como confirmada) ─────────────────────
describe('PATCH /api/email-inbound-token', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await PATCH(makeReq('PATCH'))
    expect(res.status).toBe(401)
  })

  it('marca gmail_verification_code="VERIFIED" en user_preferences', async () => {
    const { userUpsert } = setup({
      user: { id: 'u1', email: 'a@b.com' },
      existingToken: 'token',
    })

    const res = await PATCH(makeReq('PATCH'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const upsertArgs = userUpsert.mock.calls[0][0] as Record<string, unknown>
    expect(upsertArgs.gmail_verification_code).toBe('VERIFIED')
  })
})
