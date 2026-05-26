// Tests para lib/workspace.ts — helper central del workspace V2.
//
// Cubre:
//   - getCurrentWorkspace: own (sin cookie / cookie === userId / cookie con
//     share válido / cookie con share revocado / role calculation /
//     resources extraction / owner email fallback).
//   - listAccessibleWorkspaces: own + shares activos.
//   - setWorkspaceCookie / clearWorkspaceCookie.
//
// Mocks:
//   - next/headers cookies() → store en memoria.
//   - @/lib/supabase/admin adminClient → builder configurable por test.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks hoisted ──────────────────────────────────────────────────────────
const { mockCookieStore, mockAdminClient } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const cookieStore = {
    get:    (name: string) => store.has(name) ? { name, value: store.get(name)! } : undefined,
    set:    (name: string, value: string, _opts?: unknown) => { store.set(name, value) },
    delete: (name: string) => { store.delete(name) },
    _reset: () => { store.clear() },
    _setRaw: (k: string, v: string) => { store.set(k, v) },
  }

  // Builder configurable. Cada test setea responses por tabla.
  type Resp = { data: unknown; error: unknown }
  const tableResponses = new Map<string, Resp>()
  const userByIdResponses = new Map<string, { email?: string | null; throws?: boolean }>()

  function buildChain(tableName: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {}
    const terminal = tableResponses.get(tableName) ?? { data: [], error: null }
    for (const m of ['select','eq','neq','in','not','is','limit','order','single','maybeSingle']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = (onFulfilled: (v: Resp) => unknown) =>
      Promise.resolve(terminal).then(onFulfilled)
    return chain
  }

  const admin = {
    from: vi.fn((tableName: string) => buildChain(tableName)),
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => {
          const r = userByIdResponses.get(id)
          if (r?.throws) throw new Error('forced')
          return { data: { user: r ? { email: r.email ?? null } : null }, error: null }
        }),
      },
    },
    _setTable: (table: string, data: unknown, error: unknown = null) => {
      tableResponses.set(table, { data, error })
    },
    _setUser: (id: string, email: string | null, throws = false) => {
      userByIdResponses.set(id, { email, throws })
    },
    _reset: () => {
      tableResponses.clear()
      userByIdResponses.clear()
    },
  }

  return { mockCookieStore: cookieStore, mockAdminClient: admin }
})

vi.mock('next/headers', () => ({
  cookies: async () => mockCookieStore,
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: mockAdminClient,
}))

// IMPORTANTE: import después de los vi.mock para que las llamadas usen los mocks.
import {
  getCurrentWorkspace,
  listAccessibleWorkspaces,
  setWorkspaceCookie,
  clearWorkspaceCookie,
  WORKSPACE_COOKIE,
} from '@/lib/workspace'

beforeEach(() => {
  mockCookieStore._reset()
  mockAdminClient._reset()
  vi.clearAllMocks()
})

const ME    = 'user-me-uuid'
const OWNER = 'owner-uuid'
const OTHER = 'other-uuid'

describe('getCurrentWorkspace', () => {
  it('sin cookie → devuelve own workspace', async () => {
    const ws = await getCurrentWorkspace(ME)
    expect(ws).toEqual({ ownerUserId: ME, isOwn: true })
  })

  it('cookie con mi propio userId → own workspace', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, ME)
    const ws = await getCurrentWorkspace(ME)
    expect(ws).toEqual({ ownerUserId: ME, isOwn: true })
  })

  it('cookie a otro user pero sin share válido → fallback a own', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    // shares query devuelve []
    mockAdminClient._setTable('shares', [])
    const ws = await getCurrentWorkspace(ME)
    expect(ws).toEqual({ ownerUserId: ME, isOwn: true })
  })

  it('cookie a otro user CON share viewer activo → guest workspace', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    mockAdminClient._setTable('shares', [{ id: 'share-1', role: 'viewer' }])
    mockAdminClient._setTable('share_resources', [
      { resource_type: 'cuenta',     resource_id: 'cta_1' },
      { resource_type: 'cuenta',     resource_id: 'cta_2' },
      { resource_type: 'gasto_fijo', resource_id: 'gf-1' },
      { resource_type: 'inversion',  resource_id: 'inv-1' },
    ])
    mockAdminClient._setUser(OWNER, 'owner@test.com')

    const ws = await getCurrentWorkspace(ME)
    expect(ws.isOwn).toBe(false)
    expect(ws.ownerUserId).toBe(OWNER)
    expect(ws.ownerEmail).toBe('owner@test.com')
    expect(ws.role).toBe('viewer')
    expect(ws.resources?.cuentas).toEqual(new Set(['cta_1', 'cta_2']))
    expect(ws.resources?.gastosFijos).toEqual(new Set(['gf-1']))
    expect(ws.resources?.inversiones).toEqual(new Set(['inv-1']))
  })

  it('múltiples shares — role efectivo es editor si CUALQUIERA es editor', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    mockAdminClient._setTable('shares', [
      { id: 's1', role: 'viewer' },
      { id: 's2', role: 'editor' },
    ])
    mockAdminClient._setTable('share_resources', [])
    mockAdminClient._setUser(OWNER, 'o@test.com')

    const ws = await getCurrentWorkspace(ME)
    expect(ws.role).toBe('editor')
  })

  it('múltiples shares todos viewer → role viewer', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    mockAdminClient._setTable('shares', [
      { id: 's1', role: 'viewer' },
      { id: 's2', role: 'viewer' },
    ])
    mockAdminClient._setTable('share_resources', [])
    mockAdminClient._setUser(OWNER, 'o@test.com')

    const ws = await getCurrentWorkspace(ME)
    expect(ws.role).toBe('viewer')
  })

  it('lookup de email del owner falla → guest con ownerEmail null (no tira)', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    mockAdminClient._setTable('shares', [{ id: 's1', role: 'editor' }])
    mockAdminClient._setTable('share_resources', [])
    mockAdminClient._setUser(OWNER, null, /* throws */ true)

    const ws = await getCurrentWorkspace(ME)
    expect(ws.isOwn).toBe(false)
    expect(ws.ownerEmail).toBeNull()
    expect(ws.role).toBe('editor')
  })

  it('shares query devuelve null (DB error) → fallback a own', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    mockAdminClient._setTable('shares', null, { message: 'db down' })

    const ws = await getCurrentWorkspace(ME)
    expect(ws.isOwn).toBe(true)
    expect(ws.ownerUserId).toBe(ME)
  })

  it('share_resources con tipos desconocidos → se ignoran', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    mockAdminClient._setTable('shares', [{ id: 's1', role: 'viewer' }])
    mockAdminClient._setTable('share_resources', [
      { resource_type: 'cuenta',  resource_id: 'cta_1' },
      { resource_type: 'unknown', resource_id: 'xxx'   },
      { resource_type: 'garbage', resource_id: 'yyy'   },
    ])
    mockAdminClient._setUser(OWNER, 'o@test.com')

    const ws = await getCurrentWorkspace(ME)
    expect(ws.resources?.cuentas.size).toBe(1)
    expect(ws.resources?.gastosFijos.size).toBe(0)
    expect(ws.resources?.inversiones.size).toBe(0)
  })
})

describe('listAccessibleWorkspaces', () => {
  it('sin shares activos → solo own', async () => {
    mockAdminClient._setTable('shares', [])
    const list = await listAccessibleWorkspaces(ME, 'me@test.com')
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ ownerUserId: ME, ownerEmail: 'me@test.com', isOwn: true })
  })

  it('con shares activos → own + cada owner único', async () => {
    mockAdminClient._setTable('shares', [
      { owner_user_id: OWNER },
      { owner_user_id: OTHER },
      { owner_user_id: OWNER }, // duplicado, se dedup
    ])
    mockAdminClient._setUser(OWNER, 'owner@x.com')
    mockAdminClient._setUser(OTHER, 'other@x.com')

    const list = await listAccessibleWorkspaces(ME, 'me@test.com')
    expect(list).toHaveLength(3)
    expect(list[0].isOwn).toBe(true)
    expect(list.find(w => w.ownerUserId === OWNER)).toEqual({ ownerUserId: OWNER, ownerEmail: 'owner@x.com', isOwn: false })
    expect(list.find(w => w.ownerUserId === OTHER)).toEqual({ ownerUserId: OTHER, ownerEmail: 'other@x.com', isOwn: false })
  })

  it('defensive: si shares incluye al propio user, se skipea', async () => {
    mockAdminClient._setTable('shares', [
      { owner_user_id: ME }, // anomalía
      { owner_user_id: OWNER },
    ])
    mockAdminClient._setUser(OWNER, 'owner@x.com')

    const list = await listAccessibleWorkspaces(ME, 'me@test.com')
    // own + owner. NO se duplica con el "self share" anómalo.
    const ownEntries = list.filter(w => w.ownerUserId === ME)
    expect(ownEntries).toHaveLength(1)
    expect(list).toHaveLength(2)
  })

  it('owner email lookup falla → email null pero el workspace aparece', async () => {
    mockAdminClient._setTable('shares', [{ owner_user_id: OWNER }])
    mockAdminClient._setUser(OWNER, null, true)

    const list = await listAccessibleWorkspaces(ME, 'me@test.com')
    expect(list).toHaveLength(2)
    expect(list[1].ownerEmail).toBeNull()
  })

  it('sin email del current user → null', async () => {
    mockAdminClient._setTable('shares', [])
    const list = await listAccessibleWorkspaces(ME)
    expect(list[0].ownerEmail).toBeNull()
  })
})

describe('setWorkspaceCookie / clearWorkspaceCookie', () => {
  it('setWorkspaceCookie guarda el ownerUserId', async () => {
    await setWorkspaceCookie(OWNER)
    expect(mockCookieStore.get(WORKSPACE_COOKIE)?.value).toBe(OWNER)
  })

  it('clearWorkspaceCookie borra la cookie', async () => {
    mockCookieStore._setRaw(WORKSPACE_COOKIE, OWNER)
    await clearWorkspaceCookie()
    expect(mockCookieStore.get(WORKSPACE_COOKIE)).toBeUndefined()
  })

  it('setWorkspaceCookie reescribe valor previo', async () => {
    await setWorkspaceCookie(OWNER)
    await setWorkspaceCookie(OTHER)
    expect(mockCookieStore.get(WORKSPACE_COOKIE)?.value).toBe(OTHER)
  })
})
