// Tests para POST /api/inversiones

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))

import { POST } from '@/app/api/inversiones/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/inversiones', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

function supaSuccess() {
  const single = vi.fn(() => Promise.resolve({ data: { id: 'inv-1' }, error: null }))
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const from = vi.fn(() => ({ insert }))
  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: { id: 'u1' } })
}

beforeEach(() => createClientMock.mockReset())

const VALID = {
  tipo:             'plazo_fijo',
  fecha_inicio:     '2026-05-01',
  moneda:           'ARS',
  capital_inicial:  100000,
}

describe('POST /api/inversiones', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await POST(req(VALID))
    expect(res.status).toBe(401)
  })

  it('400 si tipo no es válido', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, tipo: 'nft' }))
    expect(res.status).toBe(400)
  })

  it('400 si capital_inicial es 0', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, capital_inicial: 0 }))
    expect(res.status).toBe(400)
  })

  it('400 si moneda no es ARS|USD', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, moneda: 'BRL' }))
    expect(res.status).toBe(400)
  })

  it('400 si fecha_inicio no es ISO', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: { id: 'u' } })
    const res = await POST(req({ ...VALID, fecha_inicio: '01/05/2026' }))
    expect(res.status).toBe(400)
  })

  it('happy path: 200', async () => {
    supaSuccess()
    const res = await POST(req(VALID))
    expect(res.status).toBe(201)
  })

  it('acepta todos los tipos enum (plazo_fijo, fci, cedear, accion, bono, on, crypto, dolar, otro, plazo_fijo_uva)', async () => {
    const tipos = ['plazo_fijo', 'plazo_fijo_uva', 'fci', 'cedear', 'accion', 'bono', 'on', 'crypto', 'dolar', 'otro']
    for (const tipo of tipos) {
      supaSuccess()
      const res = await POST(req({ ...VALID, tipo }))
      expect(res.status, `tipo=${tipo}`).toBe(201)
    }
  })
})
