// Tests para /api/workspace (GET list + POST switch).
//
// GET: 401 sin auth, devuelve workspaces accesibles + current.
// POST switch:
//   - 401 sin auth
//   - 400 con body inválido / formato workspace_id mal
//   - 200 con workspace_id === user.id → clear cookie (own)
//   - 200 con workspace_id de owner con share válido → setea cookie
//   - 403 con workspace_id sin share válido

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { createClientMock, cookieStore, adminFromImpl, listWorkspacesMock, getCurrentMock } = vi.hoisted(() => {
  return {
    createClientMock: vi.fn(),
    cookieStore: {
      _data: new Map<string, string>(),
      get: function (n: string) { return this._data.has(n) ? { value: this._data.get(n)! } : undefined },
      set: function (n: string, v: string) { this._data.set(n, v) },
      delete: function (n: string) { this._data.delete(n) },
      _reset: function () { this._data.clear() },
    },
    adminFromImpl: { _shares: [] as unknown[] },
    listWorkspacesMock: vi.fn(),
    getCurrentMock: vi.fn(),
  }
})

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}))

vi.mock('@/lib/supabase/admin', () => {
  function chain() {
    const c: Record<string, unknown> = {}
    for (const m of ['select','eq','neq','in','not','is','order','limit']) {
      c[m] = vi.fn(() => c)
    }
    c.then = (cb: (v: unknown) => unknown) => Promise.resolve({ data: adminFromImpl._shares, error: null }).then(cb)
    return c
  }
  return {
    adminClient: { from: vi.fn(() => chain()) },
  }
})

vi.mock('@/lib/workspace', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workspace')>('@/lib/workspace')
  return {
    ...actual,
    listAccessibleWorkspaces: listWorkspacesMock,
    getCurrentWorkspace: getCurrentMock,
  }
})

import { GET } from '@/app/api/workspace/route'
import { POST } from '@/app/api/workspace/switch/route'

beforeEach(() => {
  createClientMock.mockReset()
  listWorkspacesMock.mockReset()
  getCurrentMock.mockReset()
  cookieStore._reset()
  adminFromImpl._shares = []
})

function makeGetReq() { return new NextRequest('http://localhost/api/workspace') }
function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/workspace/switch', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ME    = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'

describe('GET /api/workspace', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  it('devuelve current + workspaces accesibles', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME, email: 'me@x.com' },
      supabase: {},
    })
    listWorkspacesMock.mockResolvedValueOnce([
      { ownerUserId: ME,    ownerEmail: 'me@x.com',   isOwn: true  },
      { ownerUserId: OWNER, ownerEmail: 'own@x.com',  isOwn: false },
    ])
    getCurrentMock.mockResolvedValueOnce({ ownerUserId: ME, isOwn: true })

    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.current.ownerUserId).toBe(ME)
    expect(body.current.isOwn).toBe(true)
    expect(body.workspaces).toHaveLength(2)
  })

  it('cuando current es guest, expone ownerEmail y role', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME, email: 'me@x.com' },
      supabase: {},
    })
    listWorkspacesMock.mockResolvedValueOnce([])
    getCurrentMock.mockResolvedValueOnce({
      ownerUserId: OWNER,
      isOwn: false,
      ownerEmail: 'own@x.com',
      role: 'editor',
    })

    const res = await GET(makeGetReq())
    const body = await res.json()
    expect(body.current.ownerEmail).toBe('own@x.com')
    expect(body.current.role).toBe('editor')
    expect(body.current.isOwn).toBe(false)
  })
})

describe('POST /api/workspace/switch', () => {
  it('401 sin auth', async () => {
    createClientMock.mockResolvedValueOnce({ user: null, supabase: {} })
    const res = await POST(makePostReq({ workspace_id: ME }))
    expect(res.status).toBe(401)
  })

  it('400 con JSON inválido', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: {} })
    const res = await POST(makePostReq('not json'))
    expect(res.status).toBe(400)
  })

  it('400 sin workspace_id en body', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: {} })
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(400)
  })

  it('400 si workspace_id no es UUID', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: {} })
    const res = await POST(makePostReq({ workspace_id: 'not-uuid' }))
    expect(res.status).toBe(400)
  })

  it('workspace_id === user.id → clear cookie + 200', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: {} })
    cookieStore._data.set('current_workspace_id', OWNER)

    const res = await POST(makePostReq({ workspace_id: ME }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isOwn).toBe(true)
    expect(cookieStore.get('current_workspace_id')).toBeUndefined()
  })

  it('workspace_id de owner con share activo → setea cookie + 200', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: {} })
    adminFromImpl._shares = [{ id: 'share-1' }]

    const res = await POST(makePostReq({ workspace_id: OWNER }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isOwn).toBe(false)
    expect(body.workspace_id).toBe(OWNER)
    expect(cookieStore.get('current_workspace_id')?.value).toBe(OWNER)
  })

  it('workspace_id sin share válido → 403, no setea cookie', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: {} })
    adminFromImpl._shares = []

    const res = await POST(makePostReq({ workspace_id: OWNER }))
    expect(res.status).toBe(403)
    expect(cookieStore.get('current_workspace_id')).toBeUndefined()
  })
})
