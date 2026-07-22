// Tests de lib/afip/ta.ts + lib/afip/facturacion.ts (todo mockeado, sin emitir).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { obtenerTA, cargarCert } from '@/lib/afip/ta'
import { emitirYGuardar, puntosDeVenta } from '@/lib/afip/facturacion'
import { encryptSecret, __resetKeyCacheForTests } from '@/lib/crypto'
import { SERVICIO_WSFE } from '@/lib/afip/wsfe'

function mockSupabase(conx: Record<string, unknown> | null) {
  const cap = { updates: [] as { name: string; patch: Record<string, unknown> }[], inserts: [] as { name: string; row: Record<string, unknown> }[] }
  const table = (name: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: name === 'afip_conexion' ? conx : null, error: null }) }) }),
    update: (patch: Record<string, unknown>) => { cap.updates.push({ name, patch }); return { eq: () => Promise.resolve({ error: null }) } },
    insert: (row: Record<string, unknown>) => { cap.inserts.push({ name, row }); return Promise.resolve({ error: null }) },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: (n: string) => table(n) } as any, cap }
}

const conx = () => ({ cuit: '20302960497', ambiente: 'produccion', cert_cipher: encryptSecret('CERT'), key_cipher: encryptSecret('KEY'), ta_cache: null as unknown })

beforeEach(() => { process.env.RESUMEN_PASSWORD_KEY = Buffer.alloc(32, 9).toString('base64'); __resetKeyCacheForTests() })
afterEach(() => { delete process.env.RESUMEN_PASSWORD_KEY; __resetKeyCacheForTests(); vi.restoreAllMocks() })

describe('cargarCert', () => {
  it('descifra cert y key', async () => {
    const { supabase } = mockSupabase(conx())
    const c = await cargarCert(supabase, 'u')
    expect(c.certPem).toBe('CERT')
    expect(c.keyPem).toBe('KEY')
    expect(c.ambiente).toBe('produccion')
  })
  it('sin cert → tira', async () => {
    const { supabase } = mockSupabase({ cuit: '20', cert_cipher: null, key_cipher: null, ta_cache: null })
    await expect(cargarCert(supabase, 'u')).rejects.toThrow(/certificado/i)
  })
})

describe('obtenerTA', () => {
  const cert = { certPem: 'C', keyPem: 'K', ambiente: 'produccion' as const }
  it('cache válido → no loguea', async () => {
    const ta_cache = { [SERVICIO_WSFE]: { t: encryptSecret('tok'), s: encryptSecret('sig'), expira: new Date(Date.now() + 3600e3).toISOString() } }
    const { supabase } = mockSupabase(null)
    const login = vi.fn()
    const ta = await obtenerTA(supabase, 'u', SERVICIO_WSFE, { ...cert, ta_cache }, login)
    expect(ta.token).toBe('tok')
    expect(login).not.toHaveBeenCalled()
  })
  it('sin cache → loguea y guarda', async () => {
    const { supabase, cap } = mockSupabase(null)
    const login = vi.fn().mockResolvedValue({ token: 'NT', sign: 'NS', expira: new Date(Date.now() + 6 * 3600e3).toISOString() })
    const ta = await obtenerTA(supabase, 'u', SERVICIO_WSFE, { ...cert, ta_cache: null }, login)
    expect(ta.token).toBe('NT')
    expect(login).toHaveBeenCalledOnce()
    expect(cap.updates.find(u => u.name === 'afip_conexion')).toBeTruthy()
  })
})

describe('emitirYGuardar', () => {
  const deps = () => ({
    loginWSAA: vi.fn().mockResolvedValue({ token: 'T', sign: 'S', expira: new Date(Date.now() + 6 * 3600e3).toISOString() }),
    emitirFacturaC: vi.fn().mockResolvedValue({ cae: '71234567890123', caeVto: '20260801', cbteNro: 1, resultado: 'A' }),
    listarPuntosVenta: vi.fn(),
  })

  it('emite y guarda en facturas_emitidas con CAE', async () => {
    const { supabase, cap } = mockSupabase(conx())
    const d = deps()
    const r = await emitirYGuardar(supabase, 'u', { ptoVta: 3, concepto: 2, docTipo: 99, docNro: 0, importe: 15000.5, cliente: 'Acme', fecha: '20260722' }, d)
    expect(r.numero).toBe('00003-00000001')
    expect(r.cae.cae).toBe('71234567890123')
    const ins = cap.inserts.find(i => i.name === 'facturas_emitidas')!.row
    expect(ins).toMatchObject({
      cae: '71234567890123', cae_vencimiento: '2026-08-01', punto_venta: '00003',
      numero_comprobante: '00003-00000001', tipo_comprobante: 'C', monto: 15000.5, cliente: 'Acme', concepto: 'servicios',
    })
    // le pasó la factura correcta al cliente wsfe
    expect(d.emitirFacturaC).toHaveBeenCalledWith(expect.objectContaining({ factura: expect.objectContaining({ ptoVta: 3, importe: 15000.5 }) }))
  })

  it('cliente vacío → "Consumidor final"', async () => {
    const { supabase, cap } = mockSupabase(conx())
    await emitirYGuardar(supabase, 'u', { ptoVta: 3, concepto: 1, docTipo: 99, docNro: 0, importe: 100, cliente: '' }, deps())
    expect(cap.inserts.find(i => i.name === 'facturas_emitidas')!.row.cliente).toBe('Consumidor final')
  })
})

describe('puntosDeVenta', () => {
  it('lista los puntos de venta', async () => {
    const { supabase } = mockSupabase(conx())
    const d = {
      loginWSAA: vi.fn().mockResolvedValue({ token: 'T', sign: 'S', expira: new Date(Date.now() + 6 * 3600e3).toISOString() }),
      emitirFacturaC: vi.fn(),
      listarPuntosVenta: vi.fn().mockResolvedValue([{ nro: 3, tipo: 'CAE', bloqueado: false }]),
    }
    const ptos = await puntosDeVenta(supabase, 'u', d)
    expect(ptos).toEqual([{ nro: 3, tipo: 'CAE', bloqueado: false }])
  })
})
