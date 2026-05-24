// Tests para lib/rate-limit.ts
//
// checkRateLimit() llama a la RPC `check_rate_limit` y mapea la respuesta.
// Mockeamos adminClient para controlar los outputs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// adminClient se exporta como const desde lib/supabase/admin — mockeamos
// el módulo para inyectar nuestro RPC mock. Usamos vi.hoisted() para
// declarar el mock antes que vi.mock() (que vitest sube al top del file).
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    rpc: rpcMock,
  },
}))

import { checkRateLimit } from '@/lib/rate-limit'

beforeEach(() => {
  rpcMock.mockReset()
})

describe('checkRateLimit', () => {
  it('RPC retorna true → { allowed: true, message: "" }', async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null })

    const r = await checkRateLimit('user-1', '/api/asistente', { max: 20, windowSeconds: 60 })
    expect(r).toEqual({ allowed: true, message: '' })
  })

  it('RPC retorna false → { allowed: false, message: "Demasiados pedidos..." }', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })

    const r = await checkRateLimit('user-1', '/api/asistente', { max: 5, windowSeconds: 30 })
    expect(r.allowed).toBe(false)
    expect(r.message).toContain('Demasiados pedidos')
    // Incluye la ventana en el mensaje para que el user sepa cuándo reintentar
    expect(r.message).toContain('30')
  })

  it('RPC retorna error → fail-open (allowed=true) + log', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })

    const r = await checkRateLimit('user-1', '/api/x', { max: 1, windowSeconds: 1 })
    expect(r).toEqual({ allowed: true, message: '' })
    expect(consoleErr).toHaveBeenCalled()
    expect(consoleErr.mock.calls[0][0]).toContain('[rate-limit]')
    consoleErr.mockRestore()
  })

  it('pasa los params correctos a la RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null })

    await checkRateLimit('user-abc', '/api/some-endpoint', { max: 100, windowSeconds: 600 })

    expect(rpcMock).toHaveBeenCalledWith('check_rate_limit', {
      p_user_id:        'user-abc',
      p_endpoint:       '/api/some-endpoint',
      p_max:            100,
      p_window_seconds: 600,
    })
  })

  it('RPC retorna data=null sin error → allowed (no es false explícito)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })

    const r = await checkRateLimit('u', '/x', { max: 1, windowSeconds: 1 })
    // La función solo bloquea con data === false. null no es false → allowed.
    expect(r.allowed).toBe(true)
  })

  it('RPC retorna data=undefined → allowed', async () => {
    rpcMock.mockResolvedValueOnce({ data: undefined, error: null })

    const r = await checkRateLimit('u', '/x', { max: 1, windowSeconds: 1 })
    expect(r.allowed).toBe(true)
  })

  it('windowSeconds=120 aparece en el mensaje de bloqueo', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const r = await checkRateLimit('u', '/x', { max: 1, windowSeconds: 120 })
    expect(r.allowed).toBe(false)
    expect(r.message).toContain('120')
  })

  it('múltiples llamadas son independientes (no comparten state)', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: true,  error: null })
      .mockResolvedValueOnce({ data: false, error: null })

    const r1 = await checkRateLimit('u', '/x', { max: 1, windowSeconds: 1 })
    const r2 = await checkRateLimit('u', '/x', { max: 1, windowSeconds: 1 })
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(false)
  })
})
