// Tests de lib/afip/mis-comprobantes.ts — parseo + aplicación del CSV de AFIP.
import { describe, it, expect, vi } from 'vitest'
import { parseMisComprobantesCSV, aplicarComprobantesCSV } from '@/lib/afip/mis-comprobantes'

const HEADER = '"Fecha de Emisión";"Tipo de Comprobante";"Punto de Venta";"Número Desde";"Número Hasta";"Cód. Autorización";"Tipo Doc. Receptor";"Nro. Doc. Receptor";"Denominación Receptor";"Tipo Cambio";"Moneda";"Imp. Neto Gravado IVA 0%";"IVA 2,5%";"Imp. Neto Gravado IVA 2,5%";"IVA 5%";"Imp. Neto Gravado IVA 5%";"IVA 10,5%";"Imp. Neto Gravado IVA 10,5%";"IVA 21%";"Imp. Neto Gravado IVA 21%";"IVA 27%";"Imp. Neto Gravado IVA 27%";"Imp. Neto Gravado Total";"Imp. Neto No Gravado";"Imp. Op. Exentas";"Otros Tributos";"Total IVA";"Imp. Total"'
const R1 = '2025-07-31;11;1;71;71;75317897374343;80;30717901262;NOMINA SUELDOS NET S.A;1,00;$;;;;;;;;;;;;0,00;0,00;0,00;0,00;0,00;2035550,00'
const R2 = '2026-04-27;11;1;99;99;86173193906384;80;33717909599;COCUN SMART S.R.L;1,00;$;;;;;;;;;;;;0,00;0,00;0,00;0,00;0,00;101000,00'
const CSV = [HEADER, R1, R2].join('\n')

describe('parseMisComprobantesCSV', () => {
  it('parsea las filas (con headers acentuados)', () => {
    const rows = parseMisComprobantesCSV(CSV)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      fecha: '2025-07-31', tipo: '11', ptoVta: 1, numero: 71, cae: '75317897374343',
      docTipo: 80, docNro: '30717901262', denominacion: 'NOMINA SUELDOS NET S.A', total: 2035550,
    })
    expect(rows[1].total).toBe(101000)
    expect(rows[1].docNro).toBe('33717909599')
  })
  it('ignora tipos que no son Factura C (11)', () => {
    const nc = R1.replace(/^2025-07-31;11;/, '2025-07-31;13;')
    expect(parseMisComprobantesCSV([HEADER, nc].join('\n'))).toHaveLength(0)
  })
  it('parsea decimales AR con miles', () => {
    const r = R1.replace('2035550,00', '1.234.567,89')
    expect(parseMisComprobantesCSV([HEADER, r].join('\n'))[0].total).toBe(1234567.89)
  })
})

function mockSupabase(existentes: Record<string, unknown>[]) {
  const cap = { inserts: [] as Record<string, unknown>[][], updates: [] as Record<string, unknown>[], upserts: [] as Record<string, unknown>[][] }
  const table = (name: string) => ({
    select: () => ({ eq: () => Promise.resolve({ data: name === 'facturas_emitidas' ? existentes : [], error: null }) }),
    insert: (rows: Record<string, unknown>[]) => { cap.inserts.push(rows); return Promise.resolve({ error: null }) },
    update: (patch: Record<string, unknown>) => { cap.updates.push(patch); return { eq: () => Promise.resolve({ error: null }) } },
    upsert: (rows: Record<string, unknown>[]) => { cap.upserts.push(rows); return Promise.resolve({ error: null }) },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: (n: string) => table(n) } as any, cap }
}

describe('aplicarComprobantesCSV', () => {
  const rows = () => parseMisComprobantesCSV(CSV)

  it('fresh: inserta facturas y clientes', async () => {
    const { supabase, cap } = mockSupabase([])
    const r = await aplicarComprobantesCSV(supabase, 'u', rows())
    expect(r).toEqual({ importadas: 2, enriquecidas: 0, clientes: 2 })
    expect(cap.inserts[0]).toHaveLength(2)
    expect(cap.inserts[0][0]).toMatchObject({ numero_comprobante: '00001-00000071', cae: '75317897374343', cliente: 'NOMINA SUELDOS NET S.A', punto_venta: '00001', monto: 2035550 })
    expect(cap.upserts[0]).toHaveLength(2)
    expect(cap.upserts[0][0]).toMatchObject({ nombre: 'NOMINA SUELDOS NET S.A', doc_tipo: 80, doc_nro: '30717901262' })
  })

  it('dedup: saltea las que ya están (por CAE)', async () => {
    const { supabase, cap } = mockSupabase([{ id: 'x', cae: '75317897374343', numero_comprobante: '00001-00000071', fecha: '2025-07-31', monto: 2035550 }])
    const r = await aplicarComprobantesCSV(supabase, 'u', rows())
    expect(r.importadas).toBe(1) // solo la #99
    expect(cap.inserts[0]).toHaveLength(1)
  })

  it('enriquece la factura cargada a mano (match por fecha+monto)', async () => {
    const { supabase, cap } = mockSupabase([{ id: 'manual1', cae: null, numero_comprobante: null, fecha: '2025-07-31', monto: 2035550 }])
    const r = await aplicarComprobantesCSV(supabase, 'u', rows())
    expect(r.enriquecidas).toBe(1)
    expect(r.importadas).toBe(1) // la #99 se inserta nueva
    expect(cap.updates[0]).toMatchObject({ cae: '75317897374343', numero_comprobante: '00001-00000071', cliente: 'NOMINA SUELDOS NET S.A' })
  })
})
