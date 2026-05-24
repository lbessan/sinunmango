// Tests para /api/tarjetas y /api/ingresos-bulk

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, rateLimitMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rateLimitMock:    vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST as TarjetasPOST }   from '@/app/api/tarjetas/route'
import { POST as BulkPOST }       from '@/app/api/ingresos-bulk/route'

function req(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

beforeEach(() => {
  createClientMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, message: '' })
})

// ── Tarjetas ───────────────────────────────────────────────────────────────
describe('POST /api/tarjetas', () => {
  function supaSuccess() {
    const insert = vi.fn(() => Promise.resolve({ error: null }))
    const from = vi.fn(() => ({ insert }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
    return { insert }
  }

  const VALID = {
    nombre_cuenta: 'Visa Galicia',
    moneda: 'ARS',
    institucion: 'Galicia',
    terminacion_tarjeta: '1234',
    fecha_cierre_tarjeta: '2026-05-25',
    fecha_vencimiento_tarjeta: '2026-06-10',
  }

  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await TarjetasPOST(req('/api/tarjetas', VALID))
    expect(res.status).toBe(401)
  })

  it('400 si falta nombre_cuenta', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await TarjetasPOST(req('/api/tarjetas', { ...VALID, nombre_cuenta: undefined }))
    expect(res.status).toBe(400)
  })

  it('400 si terminacion_tarjeta no es 4 dígitos', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await TarjetasPOST(req('/api/tarjetas', { ...VALID, terminacion_tarjeta: '12' }))
    expect(res.status).toBe(400)
  })

  it('happy path: 200', async () => {
    supaSuccess()
    const res = await TarjetasPOST(req('/api/tarjetas', VALID))
    expect(res.status).toBe(200)
  })
})

// ── Ingresos Bulk ──────────────────────────────────────────────────────────
describe('POST /api/ingresos-bulk', () => {
  function supaSuccess() {
    const insert = vi.fn(() => Promise.resolve({ error: null }))
    const from = vi.fn(() => ({ insert }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
    return { insert }
  }

  const VALID = {
    cuenta_origen:   'cta_galicia',
    monto:           500000,
    moneda:          'ARS',
    detalle:         'Sueldo',
    dia:             5,
    mes_inicio:      '2026-06',
    cantidad_meses:  12,
  }

  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await BulkPOST(req('/api/ingresos-bulk', VALID))
    expect(res.status).toBe(401)
  })

  it('429 si rate limited', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'too many' })
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await BulkPOST(req('/api/ingresos-bulk', VALID))
    expect(res.status).toBe(429)
  })

  it('400 si dia fuera de rango (32)', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await BulkPOST(req('/api/ingresos-bulk', { ...VALID, dia: 32 }))
    expect(res.status).toBe(400)
  })

  it('400 si cantidad_meses > 24', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await BulkPOST(req('/api/ingresos-bulk', { ...VALID, cantidad_meses: 25 }))
    expect(res.status).toBe(400)
  })

  it('400 si mes_inicio no es YYYY-MM', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await BulkPOST(req('/api/ingresos-bulk', { ...VALID, mes_inicio: '2026/06' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('YYYY-MM')
  })

  it('happy path: crea N registros y devuelve creados=N', async () => {
    const { insert } = supaSuccess()
    const res = await BulkPOST(req('/api/ingresos-bulk', { ...VALID, cantidad_meses: 3 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.creados).toBe(3)

    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(inserted).toHaveLength(3)
    expect(inserted[0].fecha).toBe('2026-06-05')
    expect(inserted[1].fecha).toBe('2026-07-05')
    expect(inserted[2].fecha).toBe('2026-08-05')
  })

  it('día que no existe en mes (31) → usa último día del mes', async () => {
    const { insert } = supaSuccess()
    // dia=31, mes_inicio=2026-02 → febrero no tiene 31, debe usar 28 (2026 no es bisiesto)
    await BulkPOST(req('/api/ingresos-bulk', {
      ...VALID, dia: 31, mes_inicio: '2026-02', cantidad_meses: 1,
    }))
    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    // 2026 NO es bisiesto → Feb = 28 días
    expect(inserted[0].fecha).toBe('2026-02-28')
  })

  it('user_id seteado server-side, no del body', async () => {
    const { insert } = supaSuccess()
    await BulkPOST(req('/api/ingresos-bulk', { ...VALID, user_id: 'attacker', cantidad_meses: 1 }))
    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(inserted[0].user_id).toBe('u1')
  })
})
