// Tests para /api/monotributo/config y /api/monotributo/facturas
// Cubre:
//   PUT /config:
//     - body inválido → 400
//     - body válido → upsert con user_id correcto
//   POST /facturas:
//     - body inválido → 400
//     - body válido → insert con user_id correcto y tipo_comprobante default 'C'
//   PATCH /facturas/[id]:
//     - body vacío → 400
//     - body válido → update solo de los campos enviados

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

import { PUT  as PUT_CONFIG }    from '@/app/api/monotributo/config/route'
import { POST as POST_FACTURAS } from '@/app/api/monotributo/facturas/route'
import { PATCH as PATCH_FACTURA } from '@/app/api/monotributo/facturas/[id]/route'

function jsonReq(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
  })
}

// Mock supabase con captura de upserts/inserts/updates.
function buildSupabase(opts: { row?: Record<string, unknown> } = {}) {
  const upserts: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []

  const finalRow = opts.row ?? { id: 'fact_1', user_id: 'me', monto: 1000 }

  const single = vi.fn(() => Promise.resolve({ data: finalRow, error: null }))
  const select = vi.fn(() => ({ single }))

  const eqChain: { eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> } = {
    eq:     vi.fn(() => eqChain),
    select: vi.fn(() => ({ single })),
  }

  const supabase = {
    from: vi.fn(() => ({
      upsert: vi.fn((row: Record<string, unknown>) => {
        upserts.push(row)
        return { select }
      }),
      insert: vi.fn((row: Record<string, unknown>) => {
        inserts.push(row)
        return { select }
      }),
      update: vi.fn((row: Record<string, unknown>) => {
        updates.push(row)
        return eqChain
      }),
    })),
  }
  return { supabase, upserts, inserts, updates }
}

const ME = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  createClientMock.mockReset()
})

// ── PUT /api/monotributo/config ────────────────────────────────────────────
describe('PUT /api/monotributo/config', () => {
  const VALID = {
    categoria:                'A',
    actividad:                'servicios',
    limite_facturacion_anual: 50_000_000,
    costo_mensual:            35_000,
    vigente_desde:            '2026-01-01',
  }

  it('body vacío → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await PUT_CONFIG(jsonReq('http://x/api/monotributo/config', 'PUT', {}))
    expect(res.status).toBe(400)
  })

  it('actividad inválida → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await PUT_CONFIG(jsonReq('http://x/api/monotributo/config', 'PUT', {
      ...VALID, actividad: 'crypto',
    }))
    expect(res.status).toBe(400)
  })

  it('límite negativo → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await PUT_CONFIG(jsonReq('http://x/api/monotributo/config', 'PUT', {
      ...VALID, limite_facturacion_anual: -5,
    }))
    expect(res.status).toBe(400)
  })

  it('body válido → upsert con user_id', async () => {
    const { supabase, upserts } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PUT_CONFIG(jsonReq('http://x/api/monotributo/config', 'PUT', VALID))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].user_id).toBe(ME)
    expect(upserts[0].categoria).toBe('A')
    expect(upserts[0].costo_mensual).toBe(35_000)
  })

  it('sin auth → 401', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: null })
    const res = await PUT_CONFIG(jsonReq('http://x/api/monotributo/config', 'PUT', VALID))
    expect(res.status).toBe(401)
  })
})

// ── POST /api/monotributo/facturas ─────────────────────────────────────────
describe('POST /api/monotributo/facturas', () => {
  const VALID = {
    fecha:   '2026-06-15',
    cliente: 'Sueldo SN',
    monto:   1_000_000,
  }

  it('body vacío → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await POST_FACTURAS(jsonReq('http://x/api/monotributo/facturas', 'POST', {}))
    expect(res.status).toBe(400)
  })

  it('monto cero → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await POST_FACTURAS(jsonReq('http://x/api/monotributo/facturas', 'POST', {
      ...VALID, monto: 0,
    }))
    expect(res.status).toBe(400)
  })

  it('body válido sin tipo_comprobante → insert con default C', async () => {
    const { supabase, inserts } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST_FACTURAS(jsonReq('http://x/api/monotributo/facturas', 'POST', VALID))
    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].user_id).toBe(ME)
    expect(inserts[0].cliente).toBe('Sueldo SN')
    expect(inserts[0].monto).toBe(1_000_000)
    expect(inserts[0].tipo_comprobante).toBe('C')
  })

  it('cliente con espacios extras → trimmed', async () => {
    const { supabase, inserts } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    await POST_FACTURAS(jsonReq('http://x/api/monotributo/facturas', 'POST', {
      ...VALID, cliente: '   Cliente X   ',
    }))
    expect(inserts[0].cliente).toBe('Cliente X')
  })
})

// ── PATCH /api/monotributo/facturas/[id] ───────────────────────────────────
describe('PATCH /api/monotributo/facturas/[id]', () => {
  const ID = 'fact_1'
  const ctx = { params: Promise.resolve({ id: ID }) }

  it('body vacío → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await PATCH_FACTURA(jsonReq(`http://x/api/monotributo/facturas/${ID}`, 'PATCH', {}), ctx)
    expect(res.status).toBe(400)
  })

  it('actualiza solo campos enviados', async () => {
    const { supabase, updates } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH_FACTURA(jsonReq(`http://x/api/monotributo/facturas/${ID}`, 'PATCH', {
      monto: 2_000_000,
    }), ctx)
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ monto: 2_000_000 })
  })

  it('fecha inválida → 400', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase().supabase, user: { id: ME } })
    const res = await PATCH_FACTURA(jsonReq(`http://x/api/monotributo/facturas/${ID}`, 'PATCH', {
      fecha: 'no-es-fecha',
    }), ctx)
    expect(res.status).toBe(400)
  })
})
