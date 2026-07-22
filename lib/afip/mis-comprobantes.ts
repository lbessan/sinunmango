// ─── lib/afip/mis-comprobantes.ts ────────────────────────────────────────────
//
// Importa el CSV de "Mis Comprobantes → Emitidos" de AFIP. A diferencia de wsfe
// (que solo ve el punto de venta de Web Services), este export trae TODAS las
// facturas —incluidas las del facturador online— con el CUIT y el nombre del
// cliente. Ideal para traer el historial y completar la libreta de clientes.
//
// Formato: CSV con `;`, decimales con coma, header con nombres en español.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type ComprobanteCSV = {
  fecha: string // ISO YYYY-MM-DD (ya viene así)
  tipo: string
  ptoVta: number
  numero: number
  cae: string | null
  docTipo: number
  docNro: string
  denominacion: string
  total: number
}

const pad = (n: number, l: number) => String(n).padStart(l, '0')
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim()

function parseMonto(s: string): number {
  const clean = (s || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : 0
}

/** Parsea el CSV de Mis Comprobantes → solo Facturas C (tipo 11). */
export function parseMisComprobantesCSV(text: string): ComprobanteCSV[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const split = (line: string) => line.split(';').map(f => f.replace(/^"|"$/g, '').trim())

  const header = split(lines[0]).map(norm)
  const find = (pred: (h: string) => boolean) => header.findIndex(pred)
  const i = {
    fecha: find(h => h.includes('fecha') && h.includes('emision')),
    tipo: find(h => h === 'tipo de comprobante'),
    pv: find(h => h.includes('punto de venta')),
    num: find(h => h.includes('numero desde')),
    cae: find(h => h.includes('autorizacion')),
    docT: find(h => h === 'tipo doc receptor'),
    docN: find(h => h === 'nro doc receptor'),
    denom: find(h => h.includes('denominacion')),
    total: find(h => h === 'imp total'),
  }

  const out: ComprobanteCSV[] = []
  for (let r = 1; r < lines.length; r++) {
    const f = split(lines[r])
    if (f[i.tipo] !== '11') continue // solo Factura C
    out.push({
      fecha: f[i.fecha] ?? '',
      tipo: f[i.tipo],
      ptoVta: Number(f[i.pv]) || 0,
      numero: Number(f[i.num]) || 0,
      cae: f[i.cae] || null,
      docTipo: Number(f[i.docT]) || 0,
      docNro: f[i.docN] || '',
      denominacion: f[i.denom] || '',
      total: parseMonto(f[i.total] ?? ''),
    })
  }
  return out
}

/**
 * Aplica los comprobantes del CSV: inserta las facturas nuevas, ENRIQUECE las
 * cargadas a mano que matcheen por fecha+monto (les pone CAE/número/cliente), y
 * completa la libreta de clientes con CUIT + nombre. Dedup por CAE y número.
 */
export async function aplicarComprobantesCSV(
  supabase: DB,
  userId: string,
  rows: ComprobanteCSV[],
): Promise<{ importadas: number; enriquecidas: number; clientes: number }> {
  const { data: existentes } = await supabase
    .from('facturas_emitidas').select('id, cae, numero_comprobante, fecha, monto').eq('user_id', userId)

  const caes = new Set<string>()
  const numeros = new Set<string>()
  const manualPorFp = new Map<string, string>() // "fecha|monto" → id (facturas sin CAE)
  for (const f of existentes ?? []) {
    if (f.cae) caes.add(f.cae)
    if (f.numero_comprobante) numeros.add(f.numero_comprobante)
    if (!f.cae) manualPorFp.set(`${f.fecha}|${Number(f.monto)}`, f.id)
  }

  const clientesMap = new Map<string, { doc_tipo: number; doc_nro: string }>()
  const nuevas: Database['public']['Tables']['facturas_emitidas']['Insert'][] = []
  let enriquecidas = 0

  for (const r of rows) {
    if (r.denominacion && r.docNro) clientesMap.set(r.denominacion, { doc_tipo: r.docTipo || 80, doc_nro: r.docNro })
    const numero = `${pad(r.ptoVta, 5)}-${pad(r.numero, 8)}`
    if ((r.cae && caes.has(r.cae)) || numeros.has(numero)) continue // ya la tenemos

    const fp = `${r.fecha}|${r.total}`
    const manualId = manualPorFp.get(fp)
    if (manualId) {
      // Enriquecer la factura cargada a mano con los datos oficiales.
      await supabase.from('facturas_emitidas').update({
        cae: r.cae, numero_comprobante: numero, punto_venta: pad(r.ptoVta, 5),
        cliente: r.denominacion || 'Consumidor final', tipo_comprobante: 'C',
      }).eq('id', manualId)
      enriquecidas++
      manualPorFp.delete(fp)
      numeros.add(numero)
    } else {
      nuevas.push({
        user_id: userId, fecha: r.fecha, cliente: r.denominacion || 'Consumidor final',
        monto: r.total, numero_comprobante: numero, tipo_comprobante: 'C', cae: r.cae, punto_venta: pad(r.ptoVta, 5),
      })
      numeros.add(numero)
    }
  }

  let importadas = 0
  if (nuevas.length) {
    const { error } = await supabase.from('facturas_emitidas').insert(nuevas)
    if (!error) importadas = nuevas.length
  }

  let clientes = 0
  if (clientesMap.size) {
    const rowsC = [...clientesMap].map(([nombre, d]) => ({
      user_id: userId, nombre, doc_tipo: d.doc_tipo, doc_nro: d.doc_nro, updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('clientes').upsert(rowsC, { onConflict: 'user_id,nombre' })
    if (!error) clientes = rowsC.length
  }

  return { importadas, enriquecidas, clientes }
}
