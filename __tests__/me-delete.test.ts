// Tests para POST /api/me/delete (soft delete)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { POST } from '@/app/api/me/delete/route'

function makeReq(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/me/delete', {
    method: 'POST',
    body:   body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function setupSupabase(opts: {
  user:         { id: string } | null
  updateError?: unknown
}) {
  const updateEq = vi.fn(() => Promise.resolve({ error: opts.updateError ?? null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const signOut = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn(() => ({ update }))
  const supabase = { from, auth: { signOut } }
  createClientMock.mockResolvedValueOnce({ supabase, user: opts.user })
  return { update, updateEq, signOut, from }
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('POST /api/me/delete', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq({ confirm: 'ELIMINAR' }))
    expect(res.status).toBe(401)
  })

  it('400 si body no tiene confirm="ELIMINAR"', async () => {
    setupSupabase({ user: { id: 'u' } })
    const res = await POST(makeReq({ confirm: 'eliminar' }))  // minúsculas
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Confirmación requerida')
  })

  it('400 si confirm es string distinto a "ELIMINAR"', async () => {
    setupSupabase({ user: { id: 'u' } })
    const res = await POST(makeReq({ confirm: 'BORRAR' }))
    expect(res.status).toBe(400)
  })

  it('400 si no hay confirm en absoluto', async () => {
    setupSupabase({ user: { id: 'u' } })
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('400 si el body es vacío (sin JSON)', async () => {
    setupSupabase({ user: { id: 'u' } })
    const req = new NextRequest('http://localhost/api/me/delete', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400 si el body es JSON inválido', async () => {
    setupSupabase({ user: { id: 'u' } })
    const req = new NextRequest('http://localhost/api/me/delete', {
      method: 'POST',
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('happy path: marca deleted_at, signOut, devuelve 200 con purge_after_days=30', async () => {
    const { update, updateEq, signOut } = setupSupabase({ user: { id: 'u-1' } })

    const res = await POST(makeReq({ confirm: 'ELIMINAR' }))
    expect(res.status).toBe(200)

    // Update con deleted_at = timestamp ISO
    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // Filtro por user_id
    expect(updateEq).toHaveBeenCalledWith('user_id', 'u-1')

    // signOut llamado
    expect(signOut).toHaveBeenCalledTimes(1)

    // Body de respuesta
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.deleted_at).toBeDefined()
    expect(body.purge_after_days).toBe(30)
    expect(body.message).toContain('30 días')
  })

  it('500 si la update tira error (no llama signOut)', async () => {
    const { signOut } = setupSupabase({
      user: { id: 'u' },
      updateError: { message: 'db down' },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq({ confirm: 'ELIMINAR' }))
    expect(res.status).toBe(500)
    expect(signOut).not.toHaveBeenCalled()
    consoleErr.mockRestore()
  })

  it('targetea solo el user_profile del user autenticado', async () => {
    const { updateEq } = setupSupabase({ user: { id: 'specific-user-uuid' } })
    await POST(makeReq({ confirm: 'ELIMINAR' }))
    expect(updateEq).toHaveBeenCalledWith('user_id', 'specific-user-uuid')
  })
})
