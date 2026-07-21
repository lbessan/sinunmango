// Tests para lib/afipsdk.ts — cliente de la automation `monotributo-info`.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  normalizarMonotributo,
  iniciarMonotributo,
  consultarJob,
  consultarMonotributo,
  jobEnProceso,
  jobConError,
  mensajeErrorJob,
  AfipSdkError,
} from '@/lib/afipsdk'

// Respuesta real de ejemplo de la automation (según la doc de Afip SDK).
const DATA_OK = {
  category: 'A',
  billed_amount: 1234567.89,
  billing_update_date: '12/11/2025',
  category_limit: 8992597.87,
  next_due_date: '20/11/2025',
  next_due_amount: 37085.74,
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const noSleep = () => Promise.resolve()

beforeEach(() => {
  process.env.AFIPSDK_TOKEN = 'test-token'
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.AFIPSDK_TOKEN
})

describe('normalizarMonotributo', () => {
  it('mapea los campos de la automation a nuestro shape', () => {
    const s = normalizarMonotributo(DATA_OK)
    expect(s).toEqual({
      categoria: 'A',
      facturado: 1234567.89,
      fechaFacturado: '12/11/2025',
      topeCategoria: 8992597.87,
      proximoVencimiento: '20/11/2025',
      cuotaMensual: 37085.74,
    })
  })

  it('tolera campos faltantes → null', () => {
    const s = normalizarMonotributo({ category: 'B' })
    expect(s.categoria).toBe('B')
    expect(s.facturado).toBeNull()
    expect(s.topeCategoria).toBeNull()
    expect(s.cuotaMensual).toBeNull()
  })

  it('parsea montos en string, formato AR y formato JS', () => {
    expect(normalizarMonotributo({ billed_amount: '$1.234.567,89' }).facturado).toBe(1234567.89)
    expect(normalizarMonotributo({ category_limit: '8992597.87' }).topeCategoria).toBe(8992597.87)
  })

  it('null/undefined → todo null', () => {
    const s = normalizarMonotributo(null)
    expect(s.categoria).toBeNull()
    expect(s.facturado).toBeNull()
  })
})

describe('jobEnProceso / jobConError', () => {
  it('detecta estados en proceso', () => {
    expect(jobEnProceso('in_process')).toBe(true)
    expect(jobEnProceso('IN_PROCESS')).toBe(true)
    expect(jobEnProceso('complete')).toBe(false)
    expect(jobEnProceso(undefined)).toBe(false)
  })
  it('detecta error', () => {
    expect(jobConError({ status: 'error' })).toBe(true)
    expect(jobConError({ status: 'failed' })).toBe(true)
    expect(jobConError({ status: 'complete' })).toBe(false)
  })
})

describe('mensajeErrorJob', () => {
  it('prioriza message, luego error string, luego error.message', () => {
    expect(mensajeErrorJob({ message: 'clave incorrecta' })).toBe('clave incorrecta')
    expect(mensajeErrorJob({ error: 'boom' })).toBe('boom')
    expect(mensajeErrorJob({ error: { message: 'anidado' } })).toBe('anidado')
  })
  it('fallback amigable', () => {
    expect(mensajeErrorJob({})).toMatch(/CUIT y clave fiscal/i)
  })
})

describe('iniciarMonotributo', () => {
  it('POSTea el body correcto y devuelve el job', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'job-1', status: 'in_process' }))
    vi.stubGlobal('fetch', fetchMock)

    const job = await iniciarMonotributo({ cuit: '20302960497', clave: 'secreta' })
    expect(job).toEqual({ id: 'job-1', status: 'in_process' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/automations')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-token')
    const sent = JSON.parse(init.body)
    expect(sent.automation).toBe('monotributo-info')
    expect(sent.params).toEqual({ cuit: '20302960497', username: '20302960497', password: 'secreta' })
  })

  it('tira AfipSdkError con status y data_errors en 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ statusCode: 400, data_errors: { params: { password: 'obligatorio' } } }, 400),
    ))
    await expect(iniciarMonotributo({ cuit: '20302960497', clave: '' })).rejects.toMatchObject({
      name: 'AfipSdkError',
      status: 400,
    })
  })

  it('tira AfipSdkError si falta el token', async () => {
    delete process.env.AFIPSDK_TOKEN
    await expect(iniciarMonotributo({ cuit: '20302960497', clave: 'x' })).rejects.toBeInstanceOf(AfipSdkError)
  })
})

describe('consultarJob', () => {
  it('GETea por id con auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'job-1', status: 'complete', data: DATA_OK }))
    vi.stubGlobal('fetch', fetchMock)
    const job = await consultarJob('job-1')
    expect(job.status).toBe('complete')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/automations/job-1')
    expect(init.headers.Authorization).toBe('Bearer test-token')
  })
})

describe('consultarMonotributo (poll completo)', () => {
  it('pollea hasta complete y devuelve el snapshot normalizado', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'job-1', status: 'in_process' }))   // POST inicial
      .mockResolvedValueOnce(jsonResponse({ id: 'job-1', status: 'in_process' }))   // poll 1
      .mockResolvedValueOnce(jsonResponse({ id: 'job-1', status: 'complete', data: DATA_OK })) // poll 2
    vi.stubGlobal('fetch', fetchMock)

    const sync = await consultarMonotributo({ cuit: '20302960497', clave: 'x' }, { sleep: noSleep, intervalMs: 1 })
    expect(sync.categoria).toBe('A')
    expect(sync.facturado).toBe(1234567.89)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('devuelve directo si el POST ya vino complete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ id: 'job-1', status: 'complete', data: DATA_OK }),
    ))
    const sync = await consultarMonotributo({ cuit: '20302960497', clave: 'x' }, { sleep: noSleep })
    expect(sync.categoria).toBe('A')
  })

  it('tira si el job termina en error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ id: 'job-1', status: 'error', message: 'Clave o usuario incorrecto' }),
    ))
    await expect(
      consultarMonotributo({ cuit: '20302960497', clave: 'mala' }, { sleep: noSleep }),
    ).rejects.toThrow(/Clave o usuario incorrecto/)
  })

  it('tira timeout si nunca termina', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'job-1', status: 'in_process' })))
    let t = 0
    const now = () => (t += 60000) // cada llamada avanza 60s → supera timeout 120s al 3er check
    await expect(
      consultarMonotributo({ cuit: '20302960497', clave: 'x' }, { sleep: noSleep, now, timeoutMs: 120000 }),
    ).rejects.toThrow(/timeout/i)
  })
})
