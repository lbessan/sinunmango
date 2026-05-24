// Tests para POST /api/asistente-accion
//
// Recibe una acción parseada del LLM y la valida ANTES de tocar la DB.
// Es importante testear cada validación porque el payload viene de un LLM
// (alucinaciones) o de un cliente potencialmente malicioso.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { POST } from '@/app/api/asistente-accion/route'

const VALID_ACCION = {
  tipo:         'nuevo_movimiento',
  detalle:      'gasto válido',
  monto:        4500,
  moneda:       'ARS',
  cuotas:       1,
  cuenta_id:    'cta_abc',
  categoria_id: 'cat_xyz',
  fecha:        '2026-05-24',
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/asistente-accion', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function setupSupabaseSuccess() {
  // Setup mínimo para que la operación llegue al insert si pasa validación.
  // El insert va a fallar pero no nos importa — solo testeamos validación.
  const insertSelect = vi.fn(() => Promise.resolve({ data: { id: 'm1' }, error: null }))
  const insert = vi.fn(() => ({ select: () => ({ single: insertSelect }) }))
  const eq = vi.fn(() => Promise.resolve({ data: null, error: null }))
  const select = vi.fn(() => ({ eq, single: vi.fn(() => Promise.resolve({ data: null, error: null })) }))
  const from = vi.fn(() => ({ insert, select }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
}

beforeEach(() => {
  createClientMock.mockReset()
})

describe('POST /api/asistente-accion — auth', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(makeReq(VALID_ACCION))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/asistente-accion — validación de acción', () => {
  it('400 si body es null', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq(null))
    expect(res.status).toBe(400)
  })

  it('400 si body no es objeto', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq('not an object'))
    expect(res.status).toBe(400)
  })

  it('400 si tipo distinto a "nuevo_movimiento"', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, tipo: 'borrar_cuenta' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Tipo de acción no soportado')
  })

  it('400 si detalle no es string', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, detalle: 123 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Detalle')
  })

  it('400 si detalle es string vacío (tras trim)', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, detalle: '   ' }))
    expect(res.status).toBe(400)
  })

  it('400 si detalle supera 200 chars', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, detalle: 'x'.repeat(201) }))
    expect(res.status).toBe(400)
  })

  it('400 si monto no es número', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, monto: 'mucho' }))
    expect(res.status).toBe(400)
  })

  it('400 si monto es cero', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, monto: 0 }))
    expect(res.status).toBe(400)
  })

  it('400 si monto es negativo', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, monto: -100 }))
    expect(res.status).toBe(400)
  })

  it('400 si monto supera 1.000.000.000 (defensa contra typos/overflow)', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, monto: 2_000_000_000 }))
    expect(res.status).toBe(400)
  })

  it('400 si moneda distinta a ARS o USD', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, moneda: 'BTC' }))
    expect(res.status).toBe(400)
  })

  it('400 si cuotas no es entero positivo', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, cuotas: 1.5 }))
    expect(res.status).toBe(400)
  })

  it('400 si cuotas = 0', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, cuotas: 0 }))
    expect(res.status).toBe(400)
  })

  it('400 si cuotas > 60 (5 años máx)', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, cuotas: 100 }))
    expect(res.status).toBe(400)
  })

  it('400 si cuenta_id no matchea el pattern [a-zA-Z0-9_-]{1,64}', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, cuenta_id: 'cta abc' }))  // espacio inválido
    expect(res.status).toBe(400)
  })

  it('400 si cuenta_id vacío', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, cuenta_id: '' }))
    expect(res.status).toBe(400)
  })

  it('400 si cuenta_id contiene SQL injection chars', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, cuenta_id: "'; DROP TABLE--" }))
    expect(res.status).toBe(400)
  })

  it('400 si categoria_id no matchea el pattern', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, categoria_id: 'cat/abc' }))  // slash inválido
    expect(res.status).toBe(400)
  })

  it('400 si fecha no matchea YYYY-MM-DD', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, fecha: '24/05/2026' }))
    expect(res.status).toBe(400)
  })

  it('400 si fecha es string vacío', async () => {
    setupSupabaseSuccess()
    const res = await POST(makeReq({ ...VALID_ACCION, fecha: '' }))
    expect(res.status).toBe(400)
  })

  // Nota: el happy path completo no se testea acá — requiere mockear todo
  // el flow de DB (lookup de cuenta + categoría + period calc + insert).
  // El valor de este file es la validación del input (21 casos arriba).
  // Para el happy path se necesita un test de integración aparte.
})
