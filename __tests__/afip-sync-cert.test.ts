// Tests de lib/afip/sync.ts — sync de categoría por certificado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolverConfig, sincronizarPorCert } from '@/lib/afip/sync'
import { encryptSecret, __resetKeyCacheForTests } from '@/lib/crypto'
import { SERVICIO_CONSTANCIA } from '@/lib/afip/padron'
import type { DatosMonotributo } from '@/lib/afip/padron'

const ESCALA = [
  { categoria: 'G', limite_anual: 50_000_000, cuota_servicios: 400_000, cuota_bienes: 380_000 },
  { categoria: 'H', limite_anual: 81_924_660.37, cuota_servicios: 757_202, cuota_bienes: 700_000 },
]
const datos = (over: Partial<DatosMonotributo> = {}): DatosMonotributo => ({
  categoria: 'H', descripcionCategoria: 'H LOCACIONES DE SERVICIOS', periodo: '202602',
  actividad: 'CONSULTORÍA', activo: true, ...over,
})

describe('resolverConfig', () => {
  it('servicios: usa cuota_servicios y actividad servicios', () => {
    const c = resolverConfig(datos(), ESCALA)!
    expect(c).toEqual({ categoria: 'H', limite_facturacion_anual: 81_924_660.37, costo_mensual: 757_202, actividad: 'servicios' })
  })
  it('bienes: usa cuota_bienes y actividad venta_bienes', () => {
    const c = resolverConfig(datos({ descripcionCategoria: 'H VENTA DE COSAS MUEBLES' }), ESCALA)!
    expect(c.actividad).toBe('venta_bienes')
    expect(c.costo_mensual).toBe(700_000)
  })
  it('categoría sin fila en la escala → null', () => {
    expect(resolverConfig(datos({ categoria: 'Z' }), ESCALA)).toBeNull()
  })
  it('sin categoría → null', () => {
    expect(resolverConfig(datos({ categoria: null }), ESCALA)).toBeNull()
  })
})

// Mock supabase con captura.
function mockSupabase(conx: Record<string, unknown> | null, configExists: boolean) {
  const calls = { conexionUpdate: [] as Record<string, unknown>[], configUpdate: [] as Record<string, unknown>[], configInsert: [] as Record<string, unknown>[] }
  const table = (name: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: name === 'afip_conexion' ? conx : (configExists ? { user_id: 'u' } : null), error: null }) }) }),
    update: (patch: Record<string, unknown>) => { (name === 'afip_conexion' ? calls.conexionUpdate : calls.configUpdate).push(patch); return { eq: () => Promise.resolve({ error: null }) } },
    insert: (row: Record<string, unknown>) => { calls.configInsert.push(row); return Promise.resolve({ error: null }) },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: (n: string) => table(n) } as any, calls }
}

describe('sincronizarPorCert', () => {
  beforeEach(() => { process.env.RESUMEN_PASSWORD_KEY = Buffer.alloc(32, 7).toString('base64'); __resetKeyCacheForTests() })
  afterEach(() => { delete process.env.RESUMEN_PASSWORD_KEY; __resetKeyCacheForTests(); vi.restoreAllMocks() })

  const deps = () => ({
    loginWSAA: vi.fn().mockResolvedValue({ token: 'T', sign: 'S', expira: new Date(Date.now() + 6 * 3600e3).toISOString() }),
    consultarConstancia: vi.fn().mockResolvedValue(datos()),
    fetchEscala: vi.fn().mockResolvedValue({ escala: ESCALA, vigencia: null }),
  })

  it('sin cert conectado → tira', async () => {
    const { supabase } = mockSupabase({ cuit: '20', cert_cipher: null, key_cipher: null, ta_cache: null }, false)
    await expect(sincronizarPorCert(supabase, 'u', deps())).rejects.toThrow(/certificado/i)
  })

  it('happy path: login WSAA, constancia, actualiza config y conexión', async () => {
    const conx = { cuit: '20302960497', ambiente: 'produccion', cert_cipher: encryptSecret('cert'), key_cipher: encryptSecret('key'), ta_cache: null }
    const { supabase, calls } = mockSupabase(conx, true)
    const d = deps()
    const r = await sincronizarPorCert(supabase, 'u', d)
    expect(r.datos.categoria).toBe('H')
    expect(r.configActualizada).toBe(true)
    expect(d.loginWSAA).toHaveBeenCalledOnce()
    expect(calls.configUpdate[0]).toMatchObject({ categoria: 'H', costo_mensual: 757_202, actividad: 'servicios' })
    expect(calls.conexionUpdate.at(-1)).toMatchObject({ estado: 'conectado', metodo: 'certificado' })
  })

  it('reusa el TA cacheado (no re-loguea)', async () => {
    const ta_cache = { [SERVICIO_CONSTANCIA]: { t: encryptSecret('tokCache'), s: encryptSecret('sigCache'), expira: new Date(Date.now() + 3600e3).toISOString() } }
    const conx = { cuit: '20302960497', ambiente: 'produccion', cert_cipher: encryptSecret('cert'), key_cipher: encryptSecret('key'), ta_cache }
    const { supabase } = mockSupabase(conx, true)
    const d = deps()
    await sincronizarPorCert(supabase, 'u', d)
    expect(d.loginWSAA).not.toHaveBeenCalled()
    expect(d.consultarConstancia).toHaveBeenCalledWith(expect.objectContaining({ ta: expect.objectContaining({ token: 'tokCache' }) }))
  })
})
