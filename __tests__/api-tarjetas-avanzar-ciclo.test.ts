// Tests para POST /api/tarjetas/[id]/avanzar-ciclo
//
// Avanza las fechas de la tarjeta al próximo ciclo, difiriendo si el ciclo
// actual todavía no venció (guarda en pendientes en vez de pisar las activas).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST } from '@/app/api/tarjetas/[id]/avanzar-ciclo/route'

const ME = '11111111-1111-1111-1111-111111111111'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tarjetas/t1/avanzar-ciclo', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 't1' }) }

// Mock supabase: select de la tarjeta (con venc actual) + capture del update.
function buildSupabase(vencActual: string | null) {
  const updates: Array<Record<string, unknown>> = []
  const maybeSingle = vi.fn(() => Promise.resolve({
    data: { id: 't1', tipo_cuenta: 'Tarjeta Credito', fecha_vencimiento_tarjeta: vencActual },
    error: null,
  }))
  const selEq3 = { eq: vi.fn(() => ({ maybeSingle })), maybeSingle }
  const selEq2 = { eq: vi.fn(() => selEq3) }
  const selEq1 = { eq: vi.fn(() => selEq2) }
  const select = vi.fn(() => selEq1)

  // update().eq('id').eq('tipo_cuenta').eq('user_id') → Promise
  const updEqLast = vi.fn(() => Promise.resolve({ error: null }))
  const updChain: { eq: ReturnType<typeof vi.fn> } = { eq: vi.fn(() => updChain) }
  updChain.eq = vi.fn(() => updChain)
  // El último .eq debe resolver una Promise. Como son 3 .eq encadenados y el
  // mismo objeto se reusa, lo hacemos thenable.
  ;(updChain as unknown as { then: unknown }).then = (cb: (v: { error: null }) => unknown) =>
    Promise.resolve({ error: null }).then(cb)
  const update = vi.fn((row: Record<string, unknown>) => { updates.push(row); return updChain })
  void updEqLast

  const supabase = { from: vi.fn(() => ({ select, update })) }
  return { supabase, updates }
}

const VALID = { proximo_cierre: '2026-07-23', proximo_vencimiento: '2026-08-03' }

beforeEach(() => {
  createClientMock.mockReset()
  // Fijamos "hoy" para que el diferido sea determinístico.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-26T12:00:00'))
})
afterEach(() => { vi.useRealTimers() })

describe('POST avanzar-ciclo — auth + validación', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req(VALID), ctx)
    expect(res.status).toBe(401)
  })
  it('400 sin fechas', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase('2026-07-06').supabase, user: { id: ME } })
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(400)
  })
})

describe('POST avanzar-ciclo — diferido vs directo', () => {
  it('difiere (guarda pendientes) si el ciclo actual no venció', async () => {
    // hoy 26-jun, venc actual 6-jul (futuro) → diferir
    const { supabase, updates } = buildSupabase('2026-07-06')
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(req(VALID), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deferred).toBe(true)
    expect(body.aplica_tras).toBe('2026-07-06')
    // Guardó en pendientes, NO tocó las activas.
    expect(updates[0]).toEqual({
      fecha_cierre_pendiente:      '2026-07-23',
      fecha_vencimiento_pendiente: '2026-08-03',
    })
  })

  it('aplica directo si el ciclo actual ya venció', async () => {
    // hoy 26-jun, venc actual 20-jun (pasado) → aplicar directo
    const { supabase, updates } = buildSupabase('2026-06-20')
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(req(VALID), ctx)
    const body = await res.json()
    expect(body.deferred).toBe(false)
    // Aplicó a las activas + limpió pendientes.
    expect(updates[0]).toEqual({
      fecha_cierre_tarjeta:        '2026-07-23',
      fecha_vencimiento_tarjeta:   '2026-08-03',
      fecha_cierre_pendiente:      null,
      fecha_vencimiento_pendiente: null,
    })
  })

  it('aplica directo si la tarjeta no tenía venc (recién configurada)', async () => {
    const { supabase, updates } = buildSupabase(null)
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(req(VALID), ctx)
    const body = await res.json()
    expect(body.deferred).toBe(false)
    expect(updates[0].fecha_cierre_tarjeta).toBe('2026-07-23')
  })
})
