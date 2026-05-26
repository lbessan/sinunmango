// Tests para POST/PATCH /api/tarjetas con campos de tarjetas adicionales:
//   - tarjeta_principal_id
//   - nombre_titular
//
// Cubre:
//   POST:
//     - sin tarjeta_principal_id → crea tarjeta principal normal (regresión)
//     - con tarjeta_principal_id válida → crea adicional, hereda moneda + fechas
//     - tarjeta_principal_id de una cuenta que NO es del user → 400
//     - tarjeta_principal_id de una cuenta que NO es tarjeta → 400
//     - tarjeta_principal_id apunta a otra adicional (depth>1) → 400
//   PATCH:
//     - cambiar nombre_titular → ok
//     - asignar tarjeta_principal_id válido → ok
//     - tarjeta_principal_id = id (autorreferencia) → 400
//     - principal inexistente → 400
//     - principal que ya es adicional → 400
//     - vaciar tarjeta_principal_id (null) → ok
//     - vaciar nombre_titular (null) → ok

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, rateLimitMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rateLimitMock:    vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import crypto from 'crypto'
process.env.RESUMEN_PASSWORD_KEY = crypto.randomBytes(32).toString('base64')

import { POST }  from '@/app/api/tarjetas/route'
import { PATCH } from '@/app/api/tarjetas/[id]/route'

function reqPost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tarjetas', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function reqPatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/tarjetas/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(body),
  })
}

// Helper: builds un supabase mock que responde con el row dado para la
// query .from('cuentas').select(...).eq('id',...).eq('user_id',...).maybeSingle()
// y captura los inserts/updates en arrays para inspeccionar.
function buildSupabase(opts: {
  principalRow?: Record<string, unknown> | null
} = {}) {
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []

  const maybeSingle = vi.fn(() => Promise.resolve({ data: opts.principalRow ?? null, error: null }))
  const selectChain = {
    eq: vi.fn(function (this: unknown) { return this }),
    maybeSingle,
  }
  Object.setPrototypeOf(selectChain, { eq: selectChain.eq, maybeSingle })

  const updateChain = {
    eq: vi.fn(function (this: unknown) { return this }),
    then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
  }
  Object.setPrototypeOf(updateChain, { then: updateChain.then })

  const supabase = {
    from: vi.fn(() => ({
      select:  vi.fn(() => selectChain),
      insert:  vi.fn((row: Record<string, unknown>) => {
        inserts.push(row)
        return Promise.resolve({ error: null })
      }),
      update:  vi.fn((row: Record<string, unknown>) => {
        updates.push(row)
        return updateChain
      }),
    })),
  }
  return { supabase, inserts, updates }
}

const ME       = '11111111-1111-1111-1111-111111111111'
const VALID    = {
  nombre_cuenta:       'Tarjeta Celeste',
  moneda:              'ARS',
  institucion:         'BBVA',
  terminacion_tarjeta: '5678',
}

beforeEach(() => {
  createClientMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true })
})

// ── POST ───────────────────────────────────────────────────────────────────
describe('POST /api/tarjetas — adicionales', () => {
  it('sin tarjeta_principal_id → crea principal normal (regresión)', async () => {
    const { supabase, inserts } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(reqPost(VALID))
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].tarjeta_principal_id).toBeNull()
    expect(inserts[0].nombre_titular).toBeNull()
  })

  it('con tarjeta_principal_id válida → hereda moneda + fechas + crea adicional', async () => {
    const { supabase, inserts } = buildSupabase({
      principalRow: {
        id: 'cta_principal',
        tipo_cuenta: 'Tarjeta Credito',
        tarjeta_principal_id: null,
        moneda: 'USD',
        fecha_cierre_tarjeta:      '2026-05-23',
        fecha_vencimiento_tarjeta: '2026-06-10',
      },
    })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(reqPost({
      ...VALID,
      moneda: 'ARS',  // este se IGNORA — hereda de la principal
      tarjeta_principal_id: 'cta_principal',
      nombre_titular: 'Celeste Cerono',
    }))
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].tarjeta_principal_id).toBe('cta_principal')
    expect(inserts[0].nombre_titular).toBe('Celeste Cerono')
    // Hereda
    expect(inserts[0].moneda).toBe('USD')
    expect(inserts[0].fecha_cierre_tarjeta).toBe('2026-05-23')
    expect(inserts[0].fecha_vencimiento_tarjeta).toBe('2026-06-10')
  })

  it('principal no existente / no del user → 400', async () => {
    const { supabase } = buildSupabase({ principalRow: null })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(reqPost({ ...VALID, tarjeta_principal_id: 'cta_ajena' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no existe o no es tuya/i)
  })

  it('principal que no es Tarjeta Credito → 400', async () => {
    const { supabase } = buildSupabase({
      principalRow: { id: 'cta_x', tipo_cuenta: 'Banco CA', tarjeta_principal_id: null },
    })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(reqPost({ ...VALID, tarjeta_principal_id: 'cta_x' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Tarjeta Credito/i)
  })

  it('principal que ya es adicional (depth>1) → 400', async () => {
    const { supabase } = buildSupabase({
      principalRow: {
        id: 'cta_already_adic',
        tipo_cuenta: 'Tarjeta Credito',
        tarjeta_principal_id: 'cta_root',   // ya es adicional
      },
    })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(reqPost({ ...VALID, tarjeta_principal_id: 'cta_already_adic' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/adicional de otra adicional/i)
  })

  it('nombre_titular se valida como string ≤ 100 chars', async () => {
    const { supabase } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await POST(reqPost({ ...VALID, nombre_titular: 'X'.repeat(101) }))
    expect(res.status).toBe(400)
  })
})

// ── PATCH ──────────────────────────────────────────────────────────────────
describe('PATCH /api/tarjetas/[id] — adicionales', () => {
  it('cambiar nombre_titular → 200', async () => {
    const { supabase, updates } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { nombre_titular: 'Celeste Cerono' }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(200)
    expect(updates[0].nombre_titular).toBe('Celeste Cerono')
  })

  it('asignar tarjeta_principal_id válida → 200', async () => {
    const { supabase, updates } = buildSupabase({
      principalRow: { id: 'cta_p', tipo_cuenta: 'Tarjeta Credito', tarjeta_principal_id: null },
    })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { tarjeta_principal_id: 'cta_p' }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(200)
    expect(updates[0].tarjeta_principal_id).toBe('cta_p')
  })

  it('autorreferencia (principal=id) → 400', async () => {
    const { supabase } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { tarjeta_principal_id: 'cta_x' }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no puede ser principal de sí misma/i)
  })

  it('principal inexistente → 400', async () => {
    const { supabase } = buildSupabase({ principalRow: null })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { tarjeta_principal_id: 'cta_ghost' }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(400)
  })

  it('principal que ya es adicional → 400', async () => {
    const { supabase } = buildSupabase({
      principalRow: {
        id: 'cta_p',
        tipo_cuenta: 'Tarjeta Credito',
        tarjeta_principal_id: 'cta_root',
      },
    })
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { tarjeta_principal_id: 'cta_p' }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/adicional de otra adicional/i)
  })

  it('vaciar tarjeta_principal_id (pasar a principal) → 200', async () => {
    const { supabase, updates } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { tarjeta_principal_id: null }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(200)
    expect(updates[0].tarjeta_principal_id).toBeNull()
  })

  it('vaciar nombre_titular (string vacío) → 200', async () => {
    const { supabase, updates } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ supabase, user: { id: ME } })

    const res = await PATCH(
      reqPatch('cta_x', { nombre_titular: '' }),
      { params: Promise.resolve({ id: 'cta_x' }) },
    )
    expect(res.status).toBe(200)
    expect(updates[0].nombre_titular).toBeNull()
  })
})
