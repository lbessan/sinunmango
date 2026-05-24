// Tests para lib/auth.ts
//
// El módulo expone 3 helpers que extraen el user actual:
//   - getCurrentUser()        — desde cookies (web)
//   - requireUser()           — wrapper que tira si no hay user
//   - getUserFromRequest()    — soporta cookies (web) o Bearer (mobile)
//
// Mockeamos @supabase/ssr y @supabase/supabase-js para controlar qué user
// "devuelve" Supabase. También mockeamos next/headers para cookies().

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mocks: los inyectamos antes de importar el módulo bajo test
const getUserMock = vi.fn()
const createServerClientMock = vi.fn(() => ({
  auth: { getUser: getUserMock },
}))
const createClientMock = vi.fn(() => ({
  auth: { getUser: getUserMock },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
  }),
}))

// Importamos DESPUÉS de los mocks
import { getCurrentUser, requireUser, getUserFromRequest } from '@/lib/auth'

beforeEach(() => {
  getUserMock.mockReset()
  createServerClientMock.mockClear()
  createClientMock.mockClear()
})

describe('getCurrentUser', () => {
  it('devuelve el user si hay sesión válida en cookies', async () => {
    const fakeUser = { id: 'user-1', email: 'a@b.com' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    const u = await getCurrentUser()
    expect(u).toEqual(fakeUser)
  })

  it('devuelve undefined si no hay sesión', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })

    const u = await getCurrentUser()
    expect(u).toBeNull()
  })

  it('instancia createServerClient con URL + anon key del env', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })

    await getCurrentUser()
    expect(createServerClientMock).toHaveBeenCalledTimes(1)
    const [url, key] = createServerClientMock.mock.calls[0]
    expect(url).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL)
    expect(key).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  })
})

describe('requireUser', () => {
  it('devuelve el user si está autenticado', async () => {
    const fakeUser = { id: 'user-1', email: 'a@b.com' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    const u = await requireUser()
    expect(u).toEqual(fakeUser)
  })

  it('tira "Not authenticated" si no hay user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    await expect(requireUser()).rejects.toThrow('Not authenticated')
  })

  it('tira si Supabase devuelve user=undefined (no null)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: undefined } })
    await expect(requireUser()).rejects.toThrow('Not authenticated')
  })
})

describe('getUserFromRequest', () => {
  function reqWithAuth(auth?: string): NextRequest {
    const headers = new Headers()
    if (auth != null) headers.set('authorization', auth)
    return new NextRequest('http://localhost/api/test', { headers })
  }

  it('sin header authorization → cae a getCurrentUser (cookies)', async () => {
    const fakeUser = { id: 'cookie-user', email: 'c@e.com' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    const u = await getUserFromRequest(reqWithAuth())
    expect(u).toEqual(fakeUser)
    // Usó createServerClient (web flow), NO createClient (mobile/bearer flow)
    expect(createServerClientMock).toHaveBeenCalledTimes(1)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('con Bearer token → usa createClient + getUser(token)', async () => {
    const fakeUser = { id: 'bearer-user', email: 'b@e.com' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    const u = await getUserFromRequest(reqWithAuth('Bearer mi-jwt-token'))
    expect(u).toEqual(fakeUser)
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(getUserMock).toHaveBeenCalledWith('mi-jwt-token')
  })

  it('Bearer con token inválido → devuelve null', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })

    const u = await getUserFromRequest(reqWithAuth('Bearer invalid-jwt'))
    expect(u).toBeNull()
  })

  it('header sin "Bearer " (otro formato) → cae a cookies', async () => {
    const fakeUser = { id: 'cookie-user' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    // No tiene el prefijo "Bearer "
    const u = await getUserFromRequest(reqWithAuth('Basic foo:bar'))
    expect(u).toEqual(fakeUser)
    expect(createServerClientMock).toHaveBeenCalledTimes(1)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('header "bearer " (lowercase) NO matchea (case-sensitive)', async () => {
    const fakeUser = { id: 'cookie-user' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    const u = await getUserFromRequest(reqWithAuth('bearer mi-token'))
    expect(u).toEqual(fakeUser)
    expect(createServerClientMock).toHaveBeenCalledTimes(1)
  })

  it('Bearer con token vacío → Headers normaliza, cae a cookies', async () => {
    // El runtime de Headers de Web API trimea valores. "Bearer " queda como
    // "Bearer" y startsWith('Bearer ') es false → cae al flow cookies.
    // Documentamos el comportamiento real (no es un bug — ningún cliente
    // realista manda "Bearer " sin token).
    const fakeUser = { id: 'cookie-user' }
    getUserMock.mockResolvedValueOnce({ data: { user: fakeUser } })

    const u = await getUserFromRequest(reqWithAuth('Bearer '))
    expect(u).toEqual(fakeUser)
    expect(createServerClientMock).toHaveBeenCalledTimes(1)
  })

  it('createClient en Bearer usa anon key (suficiente para validar JWT)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u' } } })

    await getUserFromRequest(reqWithAuth('Bearer xx'))
    const [url, key] = createClientMock.mock.calls[0]
    expect(url).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL)
    expect(key).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    // Específicamente NO usa service role key
    expect(key).not.toBe(process.env.SUPABASE_SERVICE_ROLE_KEY)
  })
})
