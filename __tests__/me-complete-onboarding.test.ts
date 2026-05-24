// Tests para POST /api/me/complete-onboarding
//
// Marca onboarding_completed_at = NOW() de forma idempotente.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { POST } from '@/app/api/me/complete-onboarding/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/me/complete-onboarding', { method: 'POST' })
}

function setupSupabase(opts: {
  user:         { id: string } | null
  existing?:    unknown
  updateError?: unknown
}) {
  const selectMaybeSingle = vi.fn(() => Promise.resolve({ data: opts.existing ?? null, error: null }))
  const selectEq = vi.fn(() => ({ maybeSingle: selectMaybeSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))
  const updateEq = vi.fn(() => Promise.resolve({ error: opts.updateError ?? null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  return { update, updateEq }
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('POST /api/me/complete-onboarding', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('first time: existing.onboarding_completed_at=null → update con NOW(), 200', async () => {
    const { update } = setupSupabase({
      user: { id: 'u' },
      existing: { onboarding_completed_at: null },
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.already_completed).toBeUndefined()
    expect(body.onboarding_completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const updateCall = update.mock.calls[0][0] as Record<string, unknown>
    expect(updateCall.onboarding_completed_at).toBeDefined()
  })

  it('no existe profile → trata como first time, hace update', async () => {
    const { update } = setupSupabase({
      user: { id: 'u' },
      existing: null,
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
  })

  it('idempotente: ya completado → 200 con already_completed=true, NO toca DB', async () => {
    const { update } = setupSupabase({
      user: { id: 'u' },
      existing: { onboarding_completed_at: '2026-04-01T00:00:00Z' },
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.already_completed).toBe(true)
    expect(body.onboarding_completed_at).toBe('2026-04-01T00:00:00Z')
    expect(update).not.toHaveBeenCalled()
  })

  it('500 si la update tira error', async () => {
    setupSupabase({
      user: { id: 'u' },
      existing: { onboarding_completed_at: null },
      updateError: { message: 'db down' },
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq())
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })

  it('filtra por user_id del autenticado', async () => {
    const { updateEq } = setupSupabase({
      user: { id: 'auth-user' },
      existing: null,
    })

    await POST(makeReq())
    expect(updateEq).toHaveBeenCalledWith('user_id', 'auth-user')
  })
})
