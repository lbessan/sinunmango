// Tests para POST /api/asistente/transcribir
//
// Sube un audio a Whisper y devuelve la transcripción.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, rateLimitMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rateLimitMock:    vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitMock,
}))

import { POST } from '@/app/api/asistente/transcribir/route'

function makeReq(audio?: Blob): NextRequest {
  const form = new FormData()
  if (audio !== undefined) form.append('audio', audio, 'test.webm')
  return new NextRequest('http://localhost/api/asistente/transcribir', {
    method: 'POST',
    body:   form,
  })
}

function mockOpenAIFetch(opts: { body?: unknown; status?: number; throws?: Error }) {
  const fn = vi.fn(async () => {
    if (opts.throws) throw opts.throws
    return new Response(
      typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? {}),
      { status: opts.status ?? 200 },
    )
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  createClientMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, message: '' })
  createClientMock.mockResolvedValue({ user: { id: 'u1' } })
  process.env.OPENAI_API_KEY = 'sk-test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OPENAI_API_KEY
})

describe('POST /api/asistente/transcribir — auth', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ user: null })
    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/asistente/transcribir — rate limit', () => {
  it('429 si pasó rate limit', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'Demasiados pedidos' })
    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('Demasiados pedidos')
  })

  it('rate limit configurado a 30/min', async () => {
    mockOpenAIFetch({ body: { text: 'hola' } })
    await POST(makeReq(new Blob(['x'])))
    expect(rateLimitMock).toHaveBeenCalledWith(
      'u1',
      '/api/asistente/transcribir',
      { max: 30, windowSeconds: 60 },
    )
  })
})

describe('POST /api/asistente/transcribir — configuración', () => {
  it('503 sin OPENAI_API_KEY', async () => {
    delete process.env.OPENAI_API_KEY
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('Transcripción no disponible')
    consoleErr.mockRestore()
  })
})

describe('POST /api/asistente/transcribir — validación del audio', () => {
  it('400 si no se mandó audio', async () => {
    const res = await POST(makeReq(/* sin audio */))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('audio')
  })

  it('400 si audio está vacío', async () => {
    const res = await POST(makeReq(new Blob([])))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('vacío')
  })

  it('413 si audio supera 25 MB', async () => {
    const huge = new Blob([new Uint8Array(26 * 1024 * 1024)])
    const res = await POST(makeReq(huge))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toContain('demasiado largo')
  })
})

describe('POST /api/asistente/transcribir — Whisper', () => {
  it('happy path: devuelve { text } con la transcripción', async () => {
    const fetchFn = mockOpenAIFetch({ body: { text: 'gasté cuatro mil quinientos en el súper' } })

    const res = await POST(makeReq(new Blob(['fake-audio'], { type: 'audio/webm' })))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.text).toBe('gasté cuatro mil quinientos en el súper')

    // Llamó a Whisper con auth + multipart correcto
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-test')
  })

  it('trimea whitespace del text de Whisper', async () => {
    mockOpenAIFetch({ body: { text: '   hola mundo   ' } })
    const res = await POST(makeReq(new Blob(['x'])))
    const body = await res.json()
    expect(body.text).toBe('hola mundo')
  })

  it('422 si Whisper devuelve text vacío (silencio/ruido)', async () => {
    mockOpenAIFetch({ body: { text: '' } })
    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('No te escuché bien')
  })

  it('422 si Whisper devuelve solo whitespace', async () => {
    mockOpenAIFetch({ body: { text: '   \n   ' } })
    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(422)
  })

  it('502 si fetch a Whisper falla (timeout, network)', async () => {
    mockOpenAIFetch({ throws: new Error('network down') })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('No pude conectar')
    consoleErr.mockRestore()
  })

  it('502 si Whisper devuelve error 4xx/5xx', async () => {
    mockOpenAIFetch({ body: 'rate limited', status: 429 })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('Error del servicio')
    consoleErr.mockRestore()
  })

  it('502 si Whisper devuelve 500', async () => {
    mockOpenAIFetch({ body: 'internal', status: 500 })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeReq(new Blob(['x'])))
    expect(res.status).toBe(502)
    consoleErr.mockRestore()
  })
})
