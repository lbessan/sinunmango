// Tests para POST /api/billing/mp/cancel
//
// Cubrimos:
//   - 401 sin user
//   - 404 si no tiene mp_preapproval_id
//   - Idempotencia: si ya está paused/cancelled, no llama a MP, devuelve { already_cancelled: true }
//   - Llama a pausePreapproval con el id correcto
//   - Actualiza user_profiles a mp_status=paused
//   - 502 si MP falla con MercadoPagoError
//   - 500 con error inesperado
//   - Mensaje formateado con plan_expires_at en es-AR

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MercadoPagoError } from '@/lib/mercadopago'

const { createClientMock, mpPauseMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  mpPauseMock:      vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/mercadopago', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mercadopago')>('@/lib/mercadopago')
  return { ...actual, pausePreapproval: mpPauseMock }
})

import { POST } from '@/app/api/billing/mp/cancel/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/billing/mp/cancel', { method: 'POST' })
}

function setSupabase(opts: {
  user:                { id: string } | null
  profile?:            unknown
  updateError?:        unknown
}) {
  const profileMaybeSingle = vi.fn(() => Promise.resolve({ data: opts.profile ?? null, error: null }))
  const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }))
  const profileSelect = vi.fn(() => ({ eq: profileEq }))
  const updateEq = vi.fn(() => Promise.resolve({ error: opts.updateError ?? null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select: profileSelect, update }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  return { from, update, updateEq, profileMaybeSingle }
}

beforeEach(() => {
  createClientMock.mockReset()
  mpPauseMock.mockReset()
})

describe('POST /api/billing/mp/cancel — auth', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })
})

describe('POST /api/billing/mp/cancel — validaciones', () => {
  it('404 si no hay profile (data null)', async () => {
    setSupabase({ user: { id: 'u' }, profile: null })
    const res = await POST(makeReq())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('No tenés una suscripción activa')
  })

  it('404 si profile existe pero mp_preapproval_id es null', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: { mp_preapproval_id: null, mp_status: null, plan_expires_at: null },
    })
    const res = await POST(makeReq())
    expect(res.status).toBe(404)
  })
})

describe('POST /api/billing/mp/cancel — idempotencia', () => {
  it('mp_status=paused → devuelve already_cancelled sin llamar a MP', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: {
        mp_preapproval_id: 'p1',
        mp_status: 'paused',
        plan_expires_at: '2026-06-01T00:00:00Z',
      },
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.already_cancelled).toBe(true)
    expect(body.plan_expires_at).toBe('2026-06-01T00:00:00Z')
    expect(mpPauseMock).not.toHaveBeenCalled()
  })

  it('mp_status=cancelled → devuelve already_cancelled sin llamar a MP', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: {
        mp_preapproval_id: 'p1',
        mp_status: 'cancelled',
        plan_expires_at: null,
      },
    })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.already_cancelled).toBe(true)
    expect(mpPauseMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/billing/mp/cancel — happy path', () => {
  it('mp_status=authorized → llama pausePreapproval, actualiza profile, devuelve 200', async () => {
    const { update, updateEq } = setSupabase({
      user: { id: 'u' },
      profile: {
        mp_preapproval_id: 'preapp-x',
        mp_status: 'authorized',
        plan_expires_at: '2026-06-15T00:00:00Z',
      },
    })
    mpPauseMock.mockResolvedValueOnce({ id: 'preapp-x', status: 'paused' })

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(mpPauseMock).toHaveBeenCalledWith('preapp-x')

    // Optimistic update
    expect(update).toHaveBeenCalledWith({ mp_status: 'paused' })
    expect(updateEq).toHaveBeenCalledWith('user_id', 'u')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.plan_expires_at).toBe('2026-06-15T00:00:00Z')
    expect(body.message).toContain('cancelada')
  })

  it('mensaje en plural con fecha formateada cuando hay plan_expires_at', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: {
        mp_preapproval_id: 'p',
        mp_status: 'authorized',
        plan_expires_at: '2026-06-15T00:00:00Z',
      },
    })
    mpPauseMock.mockResolvedValueOnce({})

    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.message).toContain('Seguís Pro hasta')
    // Formato es-AR: dd/mm/yyyy
    expect(body.message).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
  })

  it('mensaje simple cuando no hay plan_expires_at', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: { mp_preapproval_id: 'p', mp_status: 'authorized', plan_expires_at: null },
    })
    mpPauseMock.mockResolvedValueOnce({})

    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.message).not.toContain('Seguís Pro hasta')
    expect(body.message).toContain('Tu suscripción está cancelada')
  })

  it('mp_status=pending → permite cancelar (todavía no autorizó pero ya creó el preapproval)', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: { mp_preapproval_id: 'p', mp_status: 'pending', plan_expires_at: null },
    })
    mpPauseMock.mockResolvedValueOnce({})

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(mpPauseMock).toHaveBeenCalled()
  })

  it('si update de Supabase falla, igual devuelve 200 (webhook reconcilia después)', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: { mp_preapproval_id: 'p', mp_status: 'authorized', plan_expires_at: null },
      updateError: { message: 'db hiccup' },
    })
    mpPauseMock.mockResolvedValueOnce({})
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })
})

describe('POST /api/billing/mp/cancel — errores', () => {
  it('MercadoPagoError → 502 con mensaje guidance', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: { mp_preapproval_id: 'p', mp_status: 'authorized', plan_expires_at: null },
    })
    mpPauseMock.mockRejectedValueOnce(new MercadoPagoError('fail', 422, 'mp body'))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('No pudimos cancelar en MP')
    consoleErr.mockRestore()
  })

  it('error inesperado → 500', async () => {
    setSupabase({
      user: { id: 'u' },
      profile: { mp_preapproval_id: 'p', mp_status: 'authorized', plan_expires_at: null },
    })
    mpPauseMock.mockRejectedValueOnce(new Error('boom'))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq())
    expect(res.status).toBe(500)
    consoleErr.mockRestore()
  })
})
