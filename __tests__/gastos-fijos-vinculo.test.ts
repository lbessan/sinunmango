// Tests para el matcher movimiento ↔ gasto fijo (evita el doble conteo en proyecciones).
import { describe, it, expect } from 'vitest'
import { normalizarDetalle, proponerVinculos, type MovParaVincular, type GastoFijoParaVincular } from '@/lib/gastos-fijos-vinculo'

const mov = (over: Partial<MovParaVincular> = {}): MovParaVincular => ({
  id: 'm1', detalle: 'CAMUZZI GAS PAMPEANA', monto: 80000, moneda: 'ARS',
  cuenta_origen: 'tc1', tipo_movimiento: 'Gasto', gasto_fijo_id: null, ...over,
})
const gf = (over: Partial<GastoFijoParaVincular> = {}): GastoFijoParaVincular => ({
  id: 'gf-gas', nombre_gasto: 'Gas', monto_estimado: 80000, moneda: 'ARS',
  cuenta_pago_default: 'tc1', ...over,
})

describe('normalizarDetalle', () => {
  it('saca números, símbolos y acentos', () => {
    expect(normalizarDetalle('BIND*EDEA S.A. 12345')).toBe('bind edea s a')
    expect(normalizarDetalle('Camuzzi Gas Pampeana')).toBe('camuzzi gas pampeana')
    expect(normalizarDetalle(null)).toBe('')
  })
})

describe('proponerVinculos — regla historial', () => {
  it('vincula por detalle ya visto en un mov vinculado antes', () => {
    const historial = new Map([['gf-gas', new Set(['camuzzi gas pampeana'])]])
    const out = proponerVinculos([mov()], [gf({ monto_estimado: 999999 })], historial)
    expect(out).toEqual([{ movId: 'm1', gastoFijoId: 'gf-gas' }])  // el monto no importa: el detalle manda
  })

  it('no re-vincula un gasto fijo que ya tiene mov vinculado en el período', () => {
    const historial = new Map([['gf-gas', new Set(['camuzzi gas pampeana'])]])
    const yaVinculado = mov({ id: 'm0', gasto_fijo_id: 'gf-gas' })
    const out = proponerVinculos([yaVinculado, mov()], [gf()], historial)
    expect(out).toEqual([])
  })
})

describe('proponerVinculos — regla semilla (sin historial)', () => {
  const sinHistorial = new Map<string, Set<string>>()

  it('vincula el único candidato con monto ±25% y misma cuenta', () => {
    const out = proponerVinculos([mov({ monto: 85000 })], [gf()], sinHistorial)
    expect(out).toEqual([{ movId: 'm1', gastoFijoId: 'gf-gas' }])
  })

  it('NO vincula si hay dos candidatos posibles (ambiguo)', () => {
    const out = proponerVinculos(
      [mov({ id: 'm1', monto: 80000 }), mov({ id: 'm2', monto: 82000 })],
      [gf()],
      sinHistorial,
    )
    expect(out).toEqual([])
  })

  it('NO vincula si dos gastos fijos reclaman el mismo movimiento', () => {
    const out = proponerVinculos(
      [mov()],
      [gf({ id: 'gf-a' }), gf({ id: 'gf-b' })],
      sinHistorial,
    )
    expect(out).toEqual([])
  })

  it('NO vincula fuera de tolerancia de monto', () => {
    const out = proponerVinculos([mov({ monto: 200000 })], [gf()], sinHistorial)
    expect(out).toEqual([])
  })

  it('NO vincula si la cuenta no coincide (cuando el gasto fijo la declara)', () => {
    const out = proponerVinculos([mov({ cuenta_origen: 'otra' })], [gf()], sinHistorial)
    expect(out).toEqual([])
  })

  it('sin cuenta declarada en el gasto fijo, matchea por monto+moneda', () => {
    const out = proponerVinculos([mov({ cuenta_origen: 'otra' })], [gf({ cuenta_pago_default: null })], sinHistorial)
    expect(out).toHaveLength(1)
  })

  it('respeta la moneda (USD no matchea ARS)', () => {
    const out = proponerVinculos([mov({ moneda: 'USD', monto: 100 })], [gf({ moneda: 'ARS', monto_estimado: 100 })], sinHistorial)
    expect(out).toEqual([])
  })

  it('solo vincula Gastos (no Ingresos ni Transferencias)', () => {
    const out = proponerVinculos([mov({ tipo_movimiento: 'Ingreso' })], [gf()], sinHistorial)
    expect(out).toEqual([])
  })
})
