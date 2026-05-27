// Tests para GET /auth/callback, focalizados en el manejo del param `next`.
//
// El callback intercambia el code de Supabase por sesión y redirige al
// user. Reglas:
//   - sin code → /login
//   - error en exchange → /login?error=auth
//   - con `next` válido (path relativo) → redirect a `next` (ignora onboarding)
//   - con `next` que NO es path relativo → ignorar y seguir flujo normal
//   - sin `next` + user sin cuentas → /onboarding
//   - sin `next` + user con cuentas → /dashboard

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { exchangeCodeMock, fromMock } = vi.hoisted(() => ({
  exchangeCodeMock: vi.fn(),
  fromMock:         vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: exchangeCodeMock },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: {
    from: fromMock,
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}))

import { GET } from '@/app/auth/callback/route'

function makeReq(url: string) {
  return new NextRequest(url)
}

// Helper para mockear el query count del usuario al chequear cuentas.
function setUserCuentasCount(count: number) {
  fromMock.mockImplementationOnce(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ count, error: null })),
    })),
  }))
}

beforeEach(() => {
  exchangeCodeMock.mockReset()
  fromMock.mockReset()
})

describe('GET /auth/callback', () => {
  it('sin code → redirect a /login', async () => {
    const res = await GET(makeReq('http://localhost/auth/callback'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('exchange falla → redirect a /login?error=auth', async () => {
    exchangeCodeMock.mockResolvedValueOnce({ data: { session: null }, error: { message: 'bad' } })
    const res = await GET(makeReq('http://localhost/auth/callback?code=xyz'))
    expect(res.headers.get('location')).toContain('/login?error=auth')
  })

  it('con next válido (/invite/...) → respeta el redirect aunque no haya cuentas', async () => {
    exchangeCodeMock.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })
    // Si next se respeta, NO debería consultar cuentas. Pero por defensa,
    // si lo hace, devolvemos count=0 (que mandaría a /onboarding si pasara).
    setUserCuentasCount(0)
    const next = '/invite/' + 'a'.repeat(32)
    const res = await GET(makeReq(`http://localhost/auth/callback?code=xyz&next=${encodeURIComponent(next)}`))
    expect(res.headers.get('location')).toContain(next)
    expect(res.headers.get('location')).not.toContain('/onboarding')
  })

  it('con next inválido (path absoluto http://) → ignora y sigue flujo normal', async () => {
    exchangeCodeMock.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })
    setUserCuentasCount(3)
    const res = await GET(makeReq('http://localhost/auth/callback?code=xyz&next=http://evil.com/x'))
    // Ignora el next (no es path relativo) → flujo normal: tiene cuentas → /dashboard
    expect(res.headers.get('location')).toContain('/dashboard')
    expect(res.headers.get('location')).not.toContain('evil.com')
  })

  it('con next que empieza con // (protocol-relative) → ignora', async () => {
    exchangeCodeMock.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })
    setUserCuentasCount(3)
    const res = await GET(makeReq('http://localhost/auth/callback?code=xyz&next=//evil.com/x'))
    expect(res.headers.get('location')).not.toContain('evil.com')
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('sin next + user sin cuentas → /onboarding', async () => {
    exchangeCodeMock.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })
    setUserCuentasCount(0)
    const res = await GET(makeReq('http://localhost/auth/callback?code=xyz'))
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('sin next + user con cuentas → /dashboard', async () => {
    exchangeCodeMock.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })
    setUserCuentasCount(5)
    const res = await GET(makeReq('http://localhost/auth/callback?code=xyz'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })
})
