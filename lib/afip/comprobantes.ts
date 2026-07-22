// ─── lib/afip/comprobantes.ts ────────────────────────────────────────────────
//
// Importa las Facturas C que el usuario emitió (por wsfe, desde donde sea) y las
// guarda en facturas_emitidas, así el resumen de "a quién y cuánto" se arma solo.
//
// Recorre cada punto de venta de más nuevo a más viejo y corta al toparse con
// un comprobante que ya tenemos (dedup por CAE y por número). La primera corrida
// trae todo; las siguientes solo lo nuevo.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loginWSAA } from '@/lib/afip/wsaa'
import { cargarCert, obtenerTA } from '@/lib/afip/ta'
import {
  SERVICIO_WSFE, listarPuntosVenta, ultimoComprobante, consultarComprobante, type Comprobante,
} from '@/lib/afip/wsfe'

type DB = SupabaseClient<Database>
type FacturaInsert = Database['public']['Tables']['facturas_emitidas']['Insert']

const CBTE_FACTURA_C = 11

export type ImportDeps = {
  loginWSAA: typeof loginWSAA
  listarPuntosVenta: typeof listarPuntosVenta
  ultimoComprobante: typeof ultimoComprobante
  consultarComprobante: typeof consultarComprobante
}
const defaultDeps: ImportDeps = { loginWSAA, listarPuntosVenta, ultimoComprobante, consultarComprobante }

const pad = (n: number, l: number) => String(n).padStart(l, '0')
const isoDate = (ymd: string | null): string | null =>
  ymd && ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : null
const CONCEPTO_TXT: Record<number, string> = { 1: 'productos', 2: 'servicios', 3: 'productos y servicios' }

function clienteDesc(docTipo: number, docNro: string): string {
  if (docTipo === 99 || !docNro || docNro === '0') return 'Consumidor final'
  const label = docTipo === 80 ? 'CUIT' : docTipo === 96 ? 'DNI' : docTipo === 86 ? 'CUIL' : 'Doc'
  return `${label} ${docNro}`
}

/** Mapea un comprobante de AFIP a una fila de facturas_emitidas. */
export function comprobanteAFactura(userId: string, c: Comprobante): FacturaInsert {
  return {
    user_id: userId,
    fecha: isoDate(c.fecha) ?? new Date().toISOString().slice(0, 10),
    cliente: clienteDesc(c.docTipo, c.docNro),
    concepto: CONCEPTO_TXT[c.concepto] ?? null,
    monto: c.impTotal,
    numero_comprobante: `${pad(c.ptoVta, 5)}-${pad(c.cbteNro, 8)}`,
    tipo_comprobante: 'C',
    cae: c.cae,
    cae_vencimiento: isoDate(c.caeVto),
    punto_venta: pad(c.ptoVta, 5),
  }
}

/**
 * Trae las Facturas C emitidas desde AFIP y guarda las que falten.
 * `maxPorPto` acota la primera corrida para no colgar la función (default 400).
 */
export async function importarComprobantes(
  supabase: DB,
  userId: string,
  deps: ImportDeps = defaultDeps,
  maxPorPto = 400,
): Promise<{ importados: number; revisados: number }> {
  const cert = await cargarCert(supabase, userId)
  const ta = await obtenerTA(supabase, userId, SERVICIO_WSFE, cert, deps.loginWSAA)
  const base = { ta, cuit: cert.cuit, ambiente: cert.ambiente }
  const ptos = await deps.listarPuntosVenta(base)

  // Ya existentes → dedup por CAE y por número (cubre las emitidas por la app
  // y las cargadas a mano que tengan número).
  const { data: existentes } = await supabase
    .from('facturas_emitidas').select('cae, numero_comprobante').eq('user_id', userId)
  const caes = new Set((existentes ?? []).map(f => f.cae).filter(Boolean) as string[])
  const numeros = new Set((existentes ?? []).map(f => f.numero_comprobante).filter(Boolean) as string[])

  const nuevos: FacturaInsert[] = []
  let revisados = 0
  for (const pto of ptos.filter(p => !p.bloqueado)) {
    const ultimo = await deps.ultimoComprobante({ ...base, ptoVta: pto.nro, cbteTipo: CBTE_FACTURA_C })
    const desde = Math.max(1, ultimo - maxPorPto + 1)
    for (let n = ultimo; n >= desde; n--) {
      revisados++
      const numero = `${pad(pto.nro, 5)}-${pad(n, 8)}`
      if (numeros.has(numero)) break // ya lo tenemos → los más viejos también
      const comp = await deps.consultarComprobante({ ...base, ptoVta: pto.nro, cbteTipo: CBTE_FACTURA_C, cbteNro: n })
      if (!comp) continue
      if (comp.cae && caes.has(comp.cae)) break
      nuevos.push(comprobanteAFactura(userId, comp))
      numeros.add(numero)
      if (comp.cae) caes.add(comp.cae)
    }
  }

  let importados = 0
  if (nuevos.length) {
    const { error } = await supabase.from('facturas_emitidas').insert(nuevos)
    if (!error) importados = nuevos.length
  }
  return { importados, revisados }
}
