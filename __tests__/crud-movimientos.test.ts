// Tests para POST /api/movimientos (CRUD + bulk + cuotas grouping)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST } from '@/app/api/movimientos/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/movimientos', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function supaSuccess() {
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn(() => ({ insert }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
  return { insert }
}

beforeEach(() => createClientMock.mockReset())

const VALID_GASTO = {
  fecha:           '2026-05-24',
  monto:           4500,
  moneda:          'ARS',
  tipo_movimiento: 'Gasto',
  cuenta_origen:   'cta_galicia',
  detalle:         'Súper',
}

describe('POST /api/movimientos — auth + parsing', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req(VALID_GASTO))
    expect(res.status).toBe(401)
  })

  it('400 si JSON inválido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const r = new NextRequest('http://localhost/api/movimientos', { method: 'POST', body: 'xxx' })
    const res = await POST(r)
    expect(res.status).toBe(400)
  })

  it('400 si array vacío', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req([]))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Sin registros')
  })

  it('400 si más de 100 registros', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const arr = Array.from({ length: 101 }, () => VALID_GASTO)
    const res = await POST(req(arr))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Demasiados registros')
  })
})

describe('POST /api/movimientos — validación', () => {
  beforeEach(() => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
  })

  it('400 si fecha no es ISO', async () => {
    const res = await POST(req({ ...VALID_GASTO, fecha: '24/05/2026' }))
    expect(res.status).toBe(400)
  })

  it('400 si monto es 0', async () => {
    const res = await POST(req({ ...VALID_GASTO, monto: 0 }))
    expect(res.status).toBe(400)
  })

  it('400 si monto supera el máximo (1.000.000.000)', async () => {
    const res = await POST(req({ ...VALID_GASTO, monto: 2_000_000_000 }))
    expect(res.status).toBe(400)
  })

  it('400 si Gasto sin cuenta_origen', async () => {
    const res = await POST(req({ ...VALID_GASTO, cuenta_origen: null }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('cuenta_origen')
  })

  it('400 si Transferencia sin cuenta_destino', async () => {
    const res = await POST(req({
      ...VALID_GASTO, tipo_movimiento: 'Transferencia', cuenta_destino: null,
    }))
    expect(res.status).toBe(400)
  })

  it('400 si tipo_movimiento no válido', async () => {
    const res = await POST(req({ ...VALID_GASTO, tipo_movimiento: 'Refund' }))
    expect(res.status).toBe(400)
  })

  it('400 si cuotas_total > 60', async () => {
    const res = await POST(req({ ...VALID_GASTO, cuotas_total: 100 }))
    expect(res.status).toBe(400)
  })

  it('error message identifica el índice del registro inválido en bulk', async () => {
    const arr = [
      VALID_GASTO,
      { ...VALID_GASTO, monto: -100 },  // inválido
      VALID_GASTO,
    ]
    const res = await POST(req(arr))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Registro 1')
  })
})

describe('POST /api/movimientos — happy path', () => {
  it('200 + insert con user_id seteado server-side', async () => {
    const { insert } = supaSuccess()
    const res = await POST(req(VALID_GASTO))
    expect(res.status).toBe(200)

    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(inserted).toHaveLength(1)
    expect(inserted[0].user_id).toBe('u1')
    expect(inserted[0].id).toBeDefined()
    expect(inserted[0].fecha).toBe('2026-05-24')
    expect(inserted[0].monto).toBe(4500)
  })

  it('bulk con cuotas hermanas → asigna grupo_cuotas común automáticamente', async () => {
    const { insert } = supaSuccess()
    const cuotas = Array.from({ length: 3 }, (_, i) => ({
      ...VALID_GASTO,
      cuotas_total: 3,
      cuota_actual: i + 1,
      ciclo_actual: i + 1,
    }))

    await POST(req(cuotas))
    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(inserted).toHaveLength(3)
    // Las 3 cuotas comparten el mismo grupo_cuotas (UUID generado server-side)
    const grupo0 = inserted[0].grupo_cuotas
    expect(grupo0).toBeDefined()
    expect(grupo0).not.toBeNull()
    expect(inserted[1].grupo_cuotas).toBe(grupo0)
    expect(inserted[2].grupo_cuotas).toBe(grupo0)
  })

  it('NO asigna grupo_cuotas si cuotas_total=1', async () => {
    const { insert } = supaSuccess()
    await POST(req([VALID_GASTO, VALID_GASTO]))
    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(inserted[0].grupo_cuotas).toBeNull()
    expect(inserted[1].grupo_cuotas).toBeNull()
  })

  it('NO sobreescribe user_id del body — siempre usa el del auth', async () => {
    const { insert } = supaSuccess()
    await POST(req({ ...VALID_GASTO, user_id: 'attacker-uuid' }))
    const inserted = insert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(inserted[0].user_id).toBe('u1')  // del session, no del body
  })

  it('400 si insert falla en DB (FK violation, RLS, etc)', async () => {
    const insert = vi.fn(() => Promise.resolve({ error: { message: 'cuenta no existe' } }))
    const from = vi.fn(() => ({ insert }))
    createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u' } })

    const res = await POST(req(VALID_GASTO))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('cuenta no existe')
  })
})
