// Tests para GET /api/cron/auto-conciliar
//
// Cron diario. Para cada tarjeta cuyo día de vencimiento sea HOY (en AR),
// marca como conciliados todos los movimientos no conciliados con periodo
// anterior al mes actual.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { adminFromMock, todayPartsMock } = vi.hoisted(() => ({
  adminFromMock: vi.fn(),
  todayPartsMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

vi.mock('@/lib/timezone', () => ({
  todayPartsAR: todayPartsMock,
}))

import { GET } from '@/app/api/cron/auto-conciliar/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/auto-conciliar', {
    headers: { authorization: 'Bearer cron-secret' },
  })
}

function setTarjetasQuery(opts: {
  data?: Array<{ id: string; nombre_cuenta: string; fecha_vencimiento_tarjeta: string | null }>
  error?: unknown
}) {
  // chain: .from('cuentas').select(...).eq('tipo_cuenta', x).eq('activa', true)
  const eq2 = vi.fn(() => Promise.resolve({ data: opts.data ?? [], error: opts.error ?? null }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  adminFromMock.mockReturnValueOnce({ select })
}

function setConciliarUpdate(result: { error?: unknown } = {}) {
  // chain: .from('movimientos').update({...}).eq().eq().eq().lt()
  const lt = vi.fn(() => Promise.resolve({ error: result.error ?? null }))
  const eq3 = vi.fn(() => ({ lt }))
  const eq2 = vi.fn(() => ({ eq: eq3 }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const update = vi.fn(() => ({ eq: eq1 }))
  adminFromMock.mockReturnValueOnce({ update })
  return { update, lt }
}

beforeEach(() => {
  adminFromMock.mockReset()
  todayPartsMock.mockReset()
  process.env.CRON_SECRET = 'cron-secret'
})

describe('GET /api/cron/auto-conciliar — auth', () => {
  it('401 sin header', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 24 })
    const req = new NextRequest('http://localhost/api/cron/auto-conciliar')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/auto-conciliar — sin tarjetas', () => {
  it('200 con procesadas=[] si no hay tarjetas', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 24 })
    setTarjetasQuery({ data: [] })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.procesadas).toEqual([])
  })

  it('500 si query de tarjetas falla', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 24 })
    setTarjetasQuery({ error: { message: 'db down' } })

    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('db down')
  })
})

describe('GET /api/cron/auto-conciliar — matching de día', () => {
  it('skip tarjeta si vence el día 10 y hoy es 24', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 24 })
    setTarjetasQuery({
      data: [{ id: 't1', nombre_cuenta: 'Visa', fecha_vencimiento_tarjeta: '2026-05-10' }],
    })
    // NO debería llamarse setConciliarUpdate — pero por las dudas dejo el mock vacío

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.procesadas).toEqual([])  // no procesó nada
    // No se llamó from('movimientos') porque no hubo match
    expect(adminFromMock).toHaveBeenCalledTimes(1)
  })

  it('procesa tarjeta si vence HOY', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 10 })
    setTarjetasQuery({
      data: [{ id: 't1', nombre_cuenta: 'Visa Galicia', fecha_vencimiento_tarjeta: '2026-05-10' }],
    })
    const { update, lt } = setConciliarUpdate()

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.procesadas).toHaveLength(1)
    expect(body.procesadas[0].tarjeta).toBe('Visa Galicia')
    expect(body.procesadas[0].error).toBeNull()
    expect(update).toHaveBeenCalledWith({ conciliado: true })
    expect(lt).toHaveBeenCalledWith('periodo_tarjeta', '2026-05-01')
  })

  it('skip tarjeta con fecha_vencimiento_tarjeta null', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 10 })
    setTarjetasQuery({
      data: [{ id: 't1', nombre_cuenta: 'Master', fecha_vencimiento_tarjeta: null }],
    })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.procesadas).toEqual([])
  })

  it('procesa solo las que matchean entre varias tarjetas', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 10 })
    setTarjetasQuery({
      data: [
        { id: 't1', nombre_cuenta: 'Vence 10', fecha_vencimiento_tarjeta: '2026-05-10' },
        { id: 't2', nombre_cuenta: 'Vence 15', fecha_vencimiento_tarjeta: '2026-05-15' },
        { id: 't3', nombre_cuenta: 'Vence 10 también', fecha_vencimiento_tarjeta: '2026-05-10' },
      ],
    })
    setConciliarUpdate()
    setConciliarUpdate()

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.procesadas).toHaveLength(2)
    expect(body.procesadas.map((p: { tarjeta: string }) => p.tarjeta)).toEqual(['Vence 10', 'Vence 10 también'])
  })

  it('error en update de movimientos se incluye en procesadas (no rompe el cron)', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 5, day: 10 })
    setTarjetasQuery({
      data: [{ id: 't1', nombre_cuenta: 'Visa', fecha_vencimiento_tarjeta: '2026-05-10' }],
    })
    setConciliarUpdate({ error: { message: 'pg lock' } })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.procesadas).toHaveLength(1)
    expect(body.procesadas[0].error).toBe('pg lock')
  })

  it('inicio del mes actual usa zero-padding (2026-05-01 no 2026-5-1)', async () => {
    todayPartsMock.mockReturnValue({ year: 2026, month: 3, day: 10 })
    setTarjetasQuery({
      data: [{ id: 't1', nombre_cuenta: 'X', fecha_vencimiento_tarjeta: '2026-03-10' }],
    })
    const { lt } = setConciliarUpdate()

    await GET(makeReq())
    expect(lt).toHaveBeenCalledWith('periodo_tarjeta', '2026-03-01')
  })
})
