// Tests para POST /api/me/restore (recupera cuenta soft-deleted)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { POST } from '@/app/api/me/restore/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/me/restore', { method: 'POST' })
}

function setupSupabase(opts: {
  user:         { id: string } | null
  profile?:     unknown
  profileErr?:  unknown
  updateError?: unknown
}) {
  const selectSingle = vi.fn(() => Promise.resolve({ data: opts.profile ?? null, error: opts.profileErr ?? null }))
  const selectEq = vi.fn(() => ({ single: selectSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))
  const updateEq = vi.fn(() => Promise.resolve({ error: opts.updateError ?? null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  return { update, updateEq, select, selectSingle }
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('POST /api/me/restore', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('404 si no se encuentra el profile', async () => {
    setupSupabase({ user: { id: 'u' }, profile: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('No encontramos tu perfil')
  })

  it('404 si query de profile tira error', async () => {
    setupSupabase({
      user: { id: 'u' },
      profileErr: { message: 'db' },
    })
    const res = await POST(makeReq())
    expect(res.status).toBe(404)
  })

  it('idempotente: profile con deleted_at=null → 200 was_deleted=false sin update', async () => {
    const { update } = setupSupabase({
      user: { id: 'u' },
      profile: { deleted_at: null },
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.was_deleted).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('profile con deleted_at seteado → update a null, 200 was_deleted=true', async () => {
    const { update, updateEq } = setupSupabase({
      user: { id: 'user-1' },
      profile: { deleted_at: '2026-05-01T00:00:00Z' },
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.was_deleted).toBe(true)
    expect(body.message).toContain('restaurada')
    expect(update).toHaveBeenCalledWith({ deleted_at: null })
    expect(updateEq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('500 si la update tira error', async () => {
    setupSupabase({
      user: { id: 'u' },
      profile: { deleted_at: '2026-01-01T00:00:00Z' },
      updateError: { message: 'db down' },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq())
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })

  it('filtra por user_id del autenticado (no podés restaurar a otro user)', async () => {
    const { selectSingle, updateEq } = setupSupabase({
      user: { id: 'authed-user' },
      profile: { deleted_at: '2026-01-01T00:00:00Z' },
    })

    await POST(makeReq())
    // Tanto el select como el update filtraron por user_id correcto
    expect(updateEq).toHaveBeenCalledWith('user_id', 'authed-user')
    expect(selectSingle).toHaveBeenCalled()
  })
})
