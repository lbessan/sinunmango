// Tests para POST /api/monotributo/parsear-factura
//
// Recibe un PDF (base64), lo manda a Claude, normaliza la respuesta y la
// devuelve para que el client confirme. Cubre: auth, validación de input,
// normalización (punto_venta-numero, números), dedup por CAE, errores de IA.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, rateLimitMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rateLimitMock:    vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }))

import { POST } from '@/app/api/monotributo/parsear-factura/route'

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/monotributo/parsear-factura', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

// Mock de la respuesta de Claude: content[0].text con el JSON que devolvería.
function mockClaudeFetch(jsonText: string, status = 200) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ content: [{ text: jsonText }] }), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

// Supabase mock: el dedup hace .from('facturas_emitidas').select().eq().eq().maybeSingle()
function buildSupabase(existingCae: Record<string, unknown> | null = null) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: existingCae, error: null }))
  const eq2 = vi.fn(() => ({ maybeSingle }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  return { from: vi.fn(() => ({ select })) }
}

const ME = '11111111-1111-1111-1111-111111111111'

const FACTURA_JSON = JSON.stringify({
  fecha:            '2026-06-03',
  cliente:          'ALBOR AGTECH S. A.',
  cliente_cuit:     '30708825472',
  monto:            2959592.61,
  concepto:         'Servicio de Desarrollo Mayo 2026',
  tipo_comprobante: 'C',
  punto_venta:      '00001',
  numero:           '00000105',
  periodo_desde:    '2026-05-01',
  periodo_hasta:    '2026-05-31',
  cae:              '86228174681542',
  cae_vencimiento:  '2026-06-13',
})

beforeEach(() => {
  createClientMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true })
  createClientMock.mockResolvedValue({ supabase: buildSupabase(), user: { id: ME } })
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/monotributo/parsear-factura — auth + validación', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase(), user: null })
    const res = await POST(makeReq({ pdf: 'abc' }))
    expect(res.status).toBe(401)
  })

  it('429 si rate limit excedido', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'Demasiadas solicitudes' })
    const res = await POST(makeReq({ pdf: 'abc' }))
    expect(res.status).toBe(429)
  })

  it('400 sin pdf', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('503 sin ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await POST(makeReq({ pdf: 'abc' }))
    expect(res.status).toBe(503)
  })
})

describe('POST /api/monotributo/parsear-factura — parseo OK', () => {
  it('extrae y normaliza los datos de la factura', async () => {
    mockClaudeFetch(FACTURA_JSON)
    const res = await POST(makeReq({ pdf: 'base64data' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.factura.cliente).toBe('ALBOR AGTECH S. A.')
    expect(body.factura.cliente_cuit).toBe('30708825472')
    expect(body.factura.monto).toBe(2959592.61)
    // punto_venta + numero se combinan en numero_comprobante
    expect(body.factura.numero_comprobante).toBe('00001-00000105')
    expect(body.factura.cae).toBe('86228174681542')
    expect(body.factura.periodo_desde).toBe('2026-05-01')
  })

  it('duplicado=true si el CAE ya existe', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: buildSupabase({ id: 'existente' }), user: { id: ME } })
    mockClaudeFetch(FACTURA_JSON)
    const res = await POST(makeReq({ pdf: 'base64data' }))
    const body = await res.json()
    expect(body.duplicado).toBe(true)
  })

  it('duplicado=false si el CAE no existe', async () => {
    mockClaudeFetch(FACTURA_JSON)
    const res = await POST(makeReq({ pdf: 'base64data' }))
    const body = await res.json()
    expect(body.duplicado).toBe(false)
  })

  it('campos null cuando la IA no los detecta', async () => {
    mockClaudeFetch(JSON.stringify({
      fecha: '2026-06-03', cliente: 'X', monto: 1000,
      cliente_cuit: null, cae: null, punto_venta: null, numero: null,
    }))
    const res = await POST(makeReq({ pdf: 'base64data' }))
    const body = await res.json()
    expect(body.factura.cliente_cuit).toBeNull()
    expect(body.factura.cae).toBeNull()
    expect(body.factura.numero_comprobante).toBeNull()
    // dedup no corre si no hay CAE
    expect(body.duplicado).toBe(false)
  })

  it('tipo_comprobante default C si no viene', async () => {
    mockClaudeFetch(JSON.stringify({ fecha: '2026-06-03', cliente: 'X', monto: 1000 }))
    const res = await POST(makeReq({ pdf: 'base64data' }))
    const body = await res.json()
    expect(body.factura.tipo_comprobante).toBe('C')
  })
})

describe('POST /api/monotributo/parsear-factura — errores de IA', () => {
  it('502 si Claude devuelve error HTTP', async () => {
    mockClaudeFetch('', 500)
    const res = await POST(makeReq({ pdf: 'base64data' }))
    expect(res.status).toBe(502)
  })

  it('422 si la respuesta no es JSON parseable', async () => {
    mockClaudeFetch('esto no es json válido {{{')
    const res = await POST(makeReq({ pdf: 'base64data' }))
    expect(res.status).toBe(422)
  })
})
