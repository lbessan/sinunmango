import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock de los módulos que api.ts importa, ANTES de importar api.ts
// (vi.mock es hoisted por vitest).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))
vi.mock('@/lib/session-store', () => ({
  getStoredSession: vi.fn().mockReturnValue(null),
}))

import { apiGet, apiPost, getAuthHeader } from '@/lib/api'
import { getStoredSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'

// Helper para construir respuestas fake de fetch.
function mockResponse(opts: {
  status?:    number
  body?:      string
  contentType?: string
}): Response {
  const { status = 200, body = '', contentType = 'application/json' } = opts
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── getAuthHeader ──────────────────────────────────────────────────────────
describe('getAuthHeader', () => {
  it('devuelve {} si no hay sesión ni en store ni en AsyncStorage', async () => {
    vi.mocked(getStoredSession).mockReturnValue(null)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)

    const h = await getAuthHeader()
    expect(h).toEqual({})
  })

  it('prioriza session-store sobre AsyncStorage', async () => {
    vi.mocked(getStoredSession).mockReturnValue({ access_token: 'stored-token' } as never)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'async-storage-token' } },
    } as never)

    const h = await getAuthHeader()
    expect(h).toEqual({ Authorization: 'Bearer stored-token' })
    // No debió llamar a getSession porque ya tenía store.
    expect(supabase.auth.getSession).not.toHaveBeenCalled()
  })

  it('cae a AsyncStorage cuando store está vacío', async () => {
    vi.mocked(getStoredSession).mockReturnValue(null)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'async-token' } },
    } as never)

    const h = await getAuthHeader()
    expect(h).toEqual({ Authorization: 'Bearer async-token' })
  })
})

// ─── apiGet / apiPost — éxito ───────────────────────────────────────────────
describe('apiGet/apiPost — happy path', () => {
  it('apiGet parsea y devuelve el body JSON en 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      body: JSON.stringify({ id: 'abc', value: 42 }),
    }))

    const result = await apiGet<{ id: string; value: number }>('/api/me')
    expect(result).toEqual({ id: 'abc', value: 42 })
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('apiPost manda body como JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      body: JSON.stringify({ ok: true }),
    }))

    await apiPost('/api/foo', { foo: 'bar' })
    const call = vi.mocked(global.fetch).mock.calls[0]
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ foo: 'bar' }))
  })

  it('agrega Content-Type header en ambas', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      body: '{"ok": true}',
    }))

    await apiGet('/api/test')
    const headers = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('incluye Authorization si hay sesión', async () => {
    vi.mocked(getStoredSession).mockReturnValue({ access_token: 'my-token' } as never)
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ body: '{}' }))

    await apiGet('/api/test')
    const headers = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-token')
  })

  it('body vacío en respuesta 200 → null', async () => {
    // 204 No Content sería más realista pero el Response constructor del
    // runtime no permite body en 204; usamos 200 con body vacío que cubre
    // el mismo branch (text === '' → data permanece null).
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }))

    const result = await apiGet('/api/test')
    expect(result).toBeNull()
  })
})

// ─── apiGet/apiPost — errores ───────────────────────────────────────────────
describe('apiGet/apiPost — errores', () => {
  it('4xx con JSON {error: "..."} → throws con el message del error', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      status: 401,
      body: JSON.stringify({ error: 'Sin sesión' }),
    }))

    await expect(apiGet('/api/test')).rejects.toThrow('Sin sesión')
  })

  it('5xx sin body JSON parseable (HTML de Cloudflare) → mensaje friendly', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      status: 502,
      body: '<html><body>Bad Gateway</body></html>',
      contentType: 'text/html',
    }))

    await expect(apiGet('/api/test')).rejects.toThrow('Error del servidor (502)')
  })

  it('200 con body no-JSON → mensaje friendly', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      body: 'oops, plain text response',
      contentType: 'text/plain',
    }))

    await expect(apiGet('/api/test')).rejects.toThrow('El servidor respondió con un formato inesperado.')
  })

  it('error de red (fetch reject) → mensaje friendly', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'))

    await expect(apiGet('/api/test')).rejects.toThrow('No pudimos conectar con el servidor. Verificá tu conexión.')
  })

  it('timeout (AbortError → TimeoutError) → mensaje friendly', async () => {
    const err = new Error('Aborted')
    err.name = 'TimeoutError'
    global.fetch = vi.fn().mockRejectedValue(err)

    await expect(apiGet('/api/test')).rejects.toThrow('La conexión tardó demasiado. Probá de nuevo.')
  })

  it('4xx sin body → fallback "Error <status>"', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      status: 404,
      body: '',
    }))

    await expect(apiGet('/api/test')).rejects.toThrow('Error 404')
  })

  it('4xx con JSON pero sin campo error → fallback "Error <status>"', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({
      status: 403,
      body: JSON.stringify({ detail: 'no autorizado' }),
    }))

    await expect(apiGet('/api/test')).rejects.toThrow('Error 403')
  })
})
