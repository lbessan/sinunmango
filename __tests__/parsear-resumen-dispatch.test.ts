// Tests para el dispatcher de consumos por titular en /api/parsear-resumen.
//
// Cubre el matching case-insensitive + trim de nombre_titular contra las
// adicionales del user, y los fallbacks cuando no hay match o no hay
// adicionales configuradas.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/subscription',   () => ({
  // El endpoint usa getEffectivePlan (plan del owner del workspace activo).
  // En este test no diferenciamos own vs share — basta con simular Pro
  // efectivo para que el endpoint pase el gate de cupo.
  getUserPlan:      () => Promise.resolve({ has_pro_access: true }),
  getEffectivePlan: () => Promise.resolve({ has_pro_access: true, source: 'own', ownerEmail: null }),
}))
vi.mock('@/lib/rate-limit',     () => ({ checkRateLimit: () => Promise.resolve({ allowed: true }) }))
vi.mock('@/lib/usage-limits',   () => ({
  isOnboardingActive:  () => Promise.resolve(false),
  checkMonthlyLimit:   () => Promise.resolve({ allowed: true }),
  commitMonthlyUsage:  () => Promise.resolve(null),
  usageHeaders:        () => ({}),
}))

import { POST } from '@/app/api/parsear-resumen/route'

const ME       = '11111111-1111-1111-1111-111111111111'
const CUENTA   = 'cta_principal'
const ORIG_FETCH = global.fetch

// Builder de supabase que sirve:
//  - .from('cuentas').select().eq().eq().maybeSingle() → devuelve la cuenta (para fechas_propuestas)
//  - .from('cuentas').select().eq().eq().or(...) → devuelve familia (dispatcher)
function buildSupabase(opts: {
  cuenta?: unknown
  familia?: unknown[]
} = {}) {
  const cuenta = opts.cuenta ?? {
    id: CUENTA, tipo_cuenta: 'Tarjeta Credito',
    fecha_cierre_tarjeta: '2026-05-23', fecha_vencimiento_tarjeta: '2026-06-10',
    user_id: ME,
  }
  const familia = opts.familia ?? []
  const maybeSingle = vi.fn(() => Promise.resolve({ data: cuenta, error: null }))
  const orThenable = {
    then: (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: familia, error: null }).then(cb),
  }
  const eq2 = vi.fn(() => ({ maybeSingle, or: vi.fn(() => orThenable) }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  return { from: vi.fn(() => ({ select })) }
}

function mockClaude(payload: unknown) {
  global.fetch = vi.fn(async () => new Response(
    JSON.stringify({ content: [{ text: JSON.stringify(payload) }] }),
    { status: 200 },
  )) as unknown as typeof fetch
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/parsear-resumen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const FAKE_PDF_B64 = Buffer.from('%PDF-1.7\nfake').toString('base64')

beforeEach(() => {
  createClientMock.mockReset()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
})

afterEach(() => {
  global.fetch = ORIG_FETCH
  delete process.env.ANTHROPIC_API_KEY
  vi.clearAllMocks()
})

describe('POST /api/parsear-resumen — dispatch por titular', () => {
  it('sin cuenta_id → no agrega cuenta_origen_sugerida', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: buildSupabase() })
    mockClaude({
      transacciones: [{ fecha: '2026-04-15', detalle: 'X', monto_ars: 100, titular: 'Celeste' }],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64 }))
    const body = await res.json()
    expect(body.transacciones).toHaveLength(1)
    expect(body.transacciones[0].cuenta_origen_sugerida).toBeUndefined()
  })

  it('cuenta_id pero familia vacía (sin adicionales) → cuenta_origen_sugerida = cuenta_id', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({ familia: [] }),
    })
    mockClaude({
      transacciones: [{ fecha: '2026-04-15', detalle: 'X', monto_ars: 100, titular: 'Celeste' }],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe(CUENTA)
  })

  it('familia con adicional + titular matchea → cuenta_origen_sugerida apunta a la adicional', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        familia: [
          { id: CUENTA,        nombre_titular: 'L Bessan Nofal', tarjeta_principal_id: null },
          { id: 'cta_celeste', nombre_titular: 'Celeste Cerono', tarjeta_principal_id: CUENTA },
        ],
      }),
    })
    mockClaude({
      transacciones: [
        { fecha: '2026-04-15', detalle: 'X', monto_ars: 100, titular: 'Celeste Cerono' },
      ],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe('cta_celeste')
  })

  it('matching es case-insensitive + trim', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        familia: [
          { id: CUENTA,        nombre_titular: 'L Bessan Nofal', tarjeta_principal_id: null },
          { id: 'cta_celeste', nombre_titular: 'Celeste Cerono', tarjeta_principal_id: CUENTA },
        ],
      }),
    })
    mockClaude({
      transacciones: [
        { fecha: '2026-04-15', detalle: 'X', monto_ars: 100, titular: '  CELESTE CERONO ' },
      ],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe('cta_celeste')
  })

  it('titular NO matchea → fallback a la principal', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        familia: [
          { id: CUENTA,        nombre_titular: 'L Bessan Nofal', tarjeta_principal_id: null },
          { id: 'cta_celeste', nombre_titular: 'Celeste Cerono', tarjeta_principal_id: CUENTA },
        ],
      }),
    })
    mockClaude({
      transacciones: [
        { fecha: '2026-04-15', detalle: 'X', monto_ars: 100, titular: 'Persona Desconocida' },
      ],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe(CUENTA)
  })

  it('titular null (impuestos, descuentos) → fallback a la principal', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        familia: [
          { id: CUENTA,        nombre_titular: 'L Bessan Nofal', tarjeta_principal_id: null },
          { id: 'cta_celeste', nombre_titular: 'Celeste Cerono', tarjeta_principal_id: CUENTA },
        ],
      }),
    })
    mockClaude({
      transacciones: [
        { fecha: '2026-04-15', detalle: 'IVA', monto_ars: 100, es_impuesto: true, titular: null },
      ],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe(CUENTA)
  })

  it('múltiples transacciones se dispatchan independientemente', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        familia: [
          { id: CUENTA,        nombre_titular: 'L Bessan Nofal', tarjeta_principal_id: null },
          { id: 'cta_celeste', nombre_titular: 'Celeste Cerono', tarjeta_principal_id: CUENTA },
          { id: 'cta_juan',    nombre_titular: 'Juan Perez',     tarjeta_principal_id: CUENTA },
        ],
      }),
    })
    mockClaude({
      transacciones: [
        { fecha: '2026-04-15', detalle: 'A', monto_ars: 100, titular: 'L Bessan Nofal' },
        { fecha: '2026-04-16', detalle: 'B', monto_ars: 200, titular: 'Celeste Cerono' },
        { fecha: '2026-04-17', detalle: 'C', monto_ars: 300, titular: 'Juan Perez' },
        { fecha: '2026-04-18', detalle: 'IVA', monto_ars: 50, titular: null },
      ],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    expect(body.transacciones).toHaveLength(4)
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe(CUENTA)
    expect(body.transacciones[1].cuenta_origen_sugerida).toBe('cta_celeste')
    expect(body.transacciones[2].cuenta_origen_sugerida).toBe('cta_juan')
    expect(body.transacciones[3].cuenta_origen_sugerida).toBe(CUENTA)
  })

  it('familia con titulares pero ninguno seteado → fallback principal a todo', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({
        familia: [
          { id: CUENTA,        nombre_titular: null, tarjeta_principal_id: null },
          { id: 'cta_celeste', nombre_titular: null, tarjeta_principal_id: CUENTA },
        ],
      }),
    })
    mockClaude({
      transacciones: [
        { fecha: '2026-04-15', detalle: 'X', monto_ars: 100, titular: 'Celeste Cerono' },
      ],
    })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    const body = await res.json()
    // Ninguna cuenta tiene nombre_titular cargado → todas van a la principal
    expect(body.transacciones[0].cuenta_origen_sugerida).toBe(CUENTA)
  })
})
