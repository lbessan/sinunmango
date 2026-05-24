// Tests para GET /api/cron/purge-deleted-users
//
// Cron diario. Selecciona user_profiles con deleted_at < NOW() - 30 días,
// hace hard delete via auth.admin.deleteUser, manda email de confirmación.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { adminFromMock, deleteUserMock, getUserByIdMock } = vi.hoisted(() => ({
  adminFromMock:     vi.fn(),
  deleteUserMock:    vi.fn(),
  getUserByIdMock:   vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    from: adminFromMock,
    auth: {
      admin: {
        deleteUser:    deleteUserMock,
        getUserById:   getUserByIdMock,
      },
    },
  },
}))

import { GET } from '@/app/api/cron/purge-deleted-users/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/purge-deleted-users', {
    headers: { authorization: 'Bearer cron-secret' },
  })
}

function setPendingQuery(opts: { data?: Array<{ user_id: string; deleted_at: string }> | null; error?: unknown }) {
  // Chain: .from('user_profiles').select(...).not('deleted_at', 'is', null).lt('deleted_at', cutoff)
  const lt = vi.fn(() => Promise.resolve({ data: opts.data ?? [], error: opts.error ?? null }))
  const notFn = vi.fn(() => ({ lt }))
  const select = vi.fn(() => ({ not: notFn }))
  adminFromMock.mockReturnValueOnce({ select })
}

function mockResendFetch(opts: { ok?: boolean } = { ok: true }) {
  const fn = vi.fn(async () => new Response('{}', { status: opts.ok === false ? 500 : 200 }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  adminFromMock.mockReset()
  deleteUserMock.mockReset()
  getUserByIdMock.mockReset()
  process.env.CRON_SECRET = 'cron-secret'
  process.env.RESEND_API_KEY = 'rk_test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CRON_SECRET
  delete process.env.RESEND_API_KEY
})

describe('GET /api/cron/purge-deleted-users — auth', () => {
  it('401 sin header válido', async () => {
    const req = new NextRequest('http://localhost/api/cron/purge-deleted-users')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/purge-deleted-users — empty cases', () => {
  it('200 con purged=0 si no hay pendientes', async () => {
    setPendingQuery({ data: [] })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.purged).toBe(0)
    expect(body.message).toContain('No hay cuentas')
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('200 con purged=0 si query devuelve data=null', async () => {
    setPendingQuery({ data: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purged).toBe(0)
  })
})

describe('GET /api/cron/purge-deleted-users — happy path', () => {
  it('borra cada user pendiente y manda email de confirmación', async () => {
    setPendingQuery({ data: [
      { user_id: 'u1', deleted_at: '2026-04-01T00:00:00Z' },
      { user_id: 'u2', deleted_at: '2026-04-02T00:00:00Z' },
    ]})
    getUserByIdMock
      .mockResolvedValueOnce({ data: { user: { email: 'one@test.com' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { email: 'two@test.com' } }, error: null })
    deleteUserMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purged).toBe(2)
    expect(body.errors).toBe(0)
    expect(body.results).toHaveLength(2)
    expect(deleteUserMock).toHaveBeenCalledTimes(2)
    expect(deleteUserMock).toHaveBeenCalledWith('u1')
    expect(deleteUserMock).toHaveBeenCalledWith('u2')
    // Resend llamado para los 2 emails
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const resendCall0 = fetchFn.mock.calls[0]
    expect(resendCall0[0]).toBe('https://api.resend.com/emails')
    const reqBody = JSON.parse(resendCall0[1]!.body as string)
    expect(reqBody.to).toBe('one@test.com')
    expect(reqBody.subject).toContain('eliminada')
  })

  it('error de deleteUser en un user no rompe los demás (continúa el loop)', async () => {
    setPendingQuery({ data: [
      { user_id: 'u1', deleted_at: '2026-04-01' },
      { user_id: 'u2', deleted_at: '2026-04-02' },
      { user_id: 'u3', deleted_at: '2026-04-03' },
    ]})
    getUserByIdMock.mockResolvedValue({ data: { user: { email: 'a@b.com' } }, error: null })
    deleteUserMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'FK violation' } })
      .mockResolvedValueOnce({ error: null })
    mockResendFetch()
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.purged).toBe(2)
    expect(body.errors).toBe(1)
    const errorRow = body.results.find((r: { user_id: string }) => r.user_id === 'u2')
    expect(errorRow.status).toBe('error')
    expect(errorRow.error).toBe('FK violation')
    consoleErr.mockRestore()
  })

  it('getUserById falla → seguimos con delete (sin email, mejor que nada)', async () => {
    setPendingQuery({ data: [{ user_id: 'u1', deleted_at: '2026-04-01' }]})
    getUserByIdMock.mockResolvedValueOnce({ data: { user: null }, error: { message: 'not found' } })
    deleteUserMock.mockResolvedValueOnce({ error: null })
    const fetchFn = mockResendFetch()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.purged).toBe(1)
    expect(deleteUserMock).toHaveBeenCalled()
    // Sin email → no se intenta mandar el confirmation
    expect(fetchFn).not.toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('sin RESEND_API_KEY → borra users pero NO manda emails', async () => {
    delete process.env.RESEND_API_KEY
    setPendingQuery({ data: [{ user_id: 'u1', deleted_at: '2026-04-01' }]})
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'a@b.com' } }, error: null })
    deleteUserMock.mockResolvedValueOnce({ error: null })
    const fetchFn = mockResendFetch()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.purged).toBe(1)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('Resend falla → no rompe el delete (best effort)', async () => {
    setPendingQuery({ data: [{ user_id: 'u1', deleted_at: '2026-04-01' }]})
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: 'a@b.com' } }, error: null })
    deleteUserMock.mockResolvedValueOnce({ error: null })
    const fetchFn = vi.fn(async () => { throw new Error('resend down') })
    vi.stubGlobal('fetch', fetchFn)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purged).toBe(1)
    consoleWarn.mockRestore()
  })
})

describe('GET /api/cron/purge-deleted-users — query error', () => {
  it('500 si la query de pendientes falla', async () => {
    setPendingQuery({ error: { message: 'db down' } })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('db down')
    consoleErr.mockRestore()
  })
})
