// Tests de lib/afip/comprobantes.ts + parseComprobante (wsfe).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseComprobante, type Comprobante } from '@/lib/afip/wsfe'
import { comprobanteAFactura, importarComprobantes } from '@/lib/afip/comprobantes'
import { encryptSecret, __resetKeyCacheForTests } from '@/lib/crypto'

const RESULTGET = `<FECompConsultarResult><ResultGet><Concepto>2</Concepto><DocTipo>80</DocTipo><DocNro>20111111112</DocNro><CbteDesde>5</CbteDesde><CbteHasta>5</CbteHasta><CbteFch>20260715</CbteFch><ImpTotal>50000</ImpTotal><ImpNeto>50000</ImpNeto><CodAutorizacion>71234567890123</CodAutorizacion><FchVto>20260725</FchVto><Resultado>A</Resultado></ResultGet></FECompConsultarResult>`

describe('parseComprobante', () => {
  it('extrae los campos del comprobante', () => {
    const c = parseComprobante(RESULTGET, 3, 11)!
    expect(c).toEqual({
      ptoVta: 3, cbteTipo: 11, cbteNro: 5, fecha: '20260715', docTipo: 80,
      docNro: '20111111112', impTotal: 50000, concepto: 2, cae: '71234567890123', caeVto: '20260725',
    })
  })
  it('sin ResultGet → null', () => {
    expect(parseComprobante('<x/>', 3, 11)).toBeNull()
  })
})

describe('comprobanteAFactura', () => {
  const base: Comprobante = { ptoVta: 3, cbteTipo: 11, cbteNro: 5, fecha: '20260715', docTipo: 80, docNro: '20111111112', impTotal: 50000, concepto: 2, cae: '71234567890123', caeVto: '20260725' }
  it('mapea a fila de facturas_emitidas', () => {
    expect(comprobanteAFactura('u', base)).toEqual({
      user_id: 'u', fecha: '2026-07-15', cliente: 'CUIT 20111111112', concepto: 'servicios', monto: 50000,
      numero_comprobante: '00003-00000005', tipo_comprobante: 'C', cae: '71234567890123', cae_vencimiento: '2026-07-25', punto_venta: '00003',
    })
  })
  it('consumidor final (docTipo 99)', () => {
    expect(comprobanteAFactura('u', { ...base, docTipo: 99, docNro: '0' }).cliente).toBe('Consumidor final')
  })
})

function mockSupabase(conx: Record<string, unknown>, existing: { cae: string | null; numero_comprobante: string | null }[]) {
  const cap = { inserts: [] as Record<string, unknown>[][] }
  const table = (name: string) => ({
    select: () => ({
      eq: () => name === 'afip_conexion'
        ? { maybeSingle: () => Promise.resolve({ data: conx, error: null }) }
        : Promise.resolve({ data: existing, error: null }),
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    insert: (rows: Record<string, unknown>[]) => { cap.inserts.push(rows); return Promise.resolve({ error: null }) },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: (n: string) => table(n) } as any, cap }
}

describe('importarComprobantes', () => {
  beforeEach(() => { process.env.RESUMEN_PASSWORD_KEY = Buffer.alloc(32, 3).toString('base64'); __resetKeyCacheForTests() })
  afterEach(() => { delete process.env.RESUMEN_PASSWORD_KEY; __resetKeyCacheForTests(); vi.restoreAllMocks() })

  const conx = () => ({ cuit: '20302960497', ambiente: 'produccion', cert_cipher: encryptSecret('C'), key_cipher: encryptSecret('K'), ta_cache: null })
  const comp = (n: number): Comprobante => ({ ptoVta: 3, cbteTipo: 11, cbteNro: n, fecha: '20260715', docTipo: 99, docNro: '0', impTotal: 1000 * n, concepto: 2, cae: `CAE${n}`, caeVto: '20260725' })

  it('trae las nuevas y corta al toparse con una que ya tenemos', async () => {
    // Ya tenemos la #1. AFIP tiene hasta la #3 → debe traer #3 y #2, y parar en #1.
    const { supabase, cap } = mockSupabase(conx(), [{ cae: 'CAE1', numero_comprobante: '00003-00000001' }])
    const consultar = vi.fn(async (o: { cbteNro: number }) => comp(o.cbteNro))
    const deps = {
      loginWSAA: vi.fn().mockResolvedValue({ token: 'T', sign: 'S', expira: new Date(Date.now() + 6 * 3600e3).toISOString() }),
      listarPuntosVenta: vi.fn().mockResolvedValue([{ nro: 3, tipo: 'CAE', bloqueado: false }]),
      ultimoComprobante: vi.fn().mockResolvedValue(3),
      consultarComprobante: consultar,
    }
    const r = await importarComprobantes(supabase, 'u', deps)
    expect(r.importados).toBe(2)
    expect(consultar).toHaveBeenCalledTimes(2) // #3 y #2; en #1 corta por número antes de consultar
    expect(cap.inserts[0].map(f => f.numero_comprobante)).toEqual(['00003-00000003', '00003-00000002'])
  })

  it('sin nada nuevo → importados 0', async () => {
    const { supabase } = mockSupabase(conx(), [{ cae: null, numero_comprobante: '00003-00000001' }])
    const deps = {
      loginWSAA: vi.fn().mockResolvedValue({ token: 'T', sign: 'S', expira: new Date(Date.now() + 6 * 3600e3).toISOString() }),
      listarPuntosVenta: vi.fn().mockResolvedValue([{ nro: 3, tipo: 'CAE', bloqueado: false }]),
      ultimoComprobante: vi.fn().mockResolvedValue(1),
      consultarComprobante: vi.fn(),
    }
    const r = await importarComprobantes(supabase, 'u', deps)
    expect(r.importados).toBe(0)
  })
})
