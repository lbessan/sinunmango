// ─── lib/afip/facturacion.ts ─────────────────────────────────────────────────
//
// Emite Facturas C por wsfe con el certificado del usuario y las guarda en
// facturas_emitidas (con su CAE + ítems). Directo a AFIP, sin terceros.
//
// wsfe autoriza el TOTAL; los ítems son para el PDF y el registro (se guardan
// en facturas_emitidas.items, no van a AFIP).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { loginWSAA } from '@/lib/afip/wsaa'
import { cargarCert, obtenerTA } from '@/lib/afip/ta'
import {
  SERVICIO_WSFE, emitirFacturaC, listarPuntosVenta,
  type FacturaC, type CaeResult, type PuntoVenta,
} from '@/lib/afip/wsfe'

type DB = SupabaseClient<Database>

export type FacturaDeps = {
  loginWSAA: typeof loginWSAA
  emitirFacturaC: typeof emitirFacturaC
  listarPuntosVenta: typeof listarPuntosVenta
}
const defaultDeps: FacturaDeps = { loginWSAA, emitirFacturaC, listarPuntosVenta }

export type ItemFactura = { descripcion: string; cantidad: number; precio: number }

export type EmitirInput = {
  ptoVta: number
  concepto: 1 | 2 | 3 // 1 productos, 2 servicios, 3 ambos
  docTipo: number // 80 CUIT, 96 DNI, 99 consumidor final
  docNro: number
  cliente: string // nombre/razón social para guardar
  condicionIvaReceptor?: number // 1 RI, 4 Exento, 5 CF, 6 Monotributo
  items?: ItemFactura[] // detalle (para el PDF/registro)
  importe?: number // usado si no hay ítems
  fecha?: string // YYYYMMDD
  fchServDesde?: string
  fchServHasta?: string
  fchVtoPago?: string
}

const pad = (n: number, l: number) => String(n).padStart(l, '0')
const isoDesdeYmd = (ymd?: string): string | null =>
  ymd && ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : null
const CONCEPTO_TXT: Record<number, string> = { 1: 'productos', 2: 'servicios', 3: 'productos y servicios' }

/** Total de los ítems (cantidad × precio), o el importe suelto. */
export function totalDeItems(input: Pick<EmitirInput, 'items' | 'importe'>): number {
  if (input.items?.length) {
    return Number(input.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio) || 0), 0).toFixed(2))
  }
  return Number((input.importe ?? 0).toFixed(2))
}

/** Lista los puntos de venta habilitados para Web Services. */
export async function puntosDeVenta(supabase: DB, userId: string, deps: FacturaDeps = defaultDeps): Promise<PuntoVenta[]> {
  const cert = await cargarCert(supabase, userId)
  const ta = await obtenerTA(supabase, userId, SERVICIO_WSFE, cert, deps.loginWSAA)
  return deps.listarPuntosVenta({ ta, cuit: cert.cuit, ambiente: cert.ambiente })
}

/**
 * Emite una Factura C y la guarda en facturas_emitidas con su CAE + ítems.
 * Devuelve el CAE, el número ("00003-00000001") y el id de la factura guardada.
 */
export async function emitirYGuardar(
  supabase: DB,
  userId: string,
  input: EmitirInput,
  deps: FacturaDeps = defaultDeps,
): Promise<{ cae: CaeResult; numero: string; id: string | null }> {
  const cert = await cargarCert(supabase, userId)
  const ta = await obtenerTA(supabase, userId, SERVICIO_WSFE, cert, deps.loginWSAA)

  const total = totalDeItems(input)
  const factura: FacturaC = {
    ptoVta: input.ptoVta,
    concepto: input.concepto,
    docTipo: input.docTipo,
    docNro: input.docNro,
    importe: total,
    condicionIvaReceptor: input.condicionIvaReceptor,
    fecha: input.fecha,
    fchServDesde: input.fchServDesde,
    fchServHasta: input.fchServHasta,
    fchVtoPago: input.fchVtoPago,
  }
  const cae = await deps.emitirFacturaC({ ta, cuit: cert.cuit, ambiente: cert.ambiente, factura })

  const numero = `${pad(input.ptoVta, 5)}-${pad(cae.cbteNro, 8)}`
  const { data } = await supabase.from('facturas_emitidas').insert({
    user_id: userId,
    fecha: isoDesdeYmd(input.fecha) ?? new Date().toISOString().slice(0, 10),
    cliente: input.cliente.trim() || 'Consumidor final',
    cliente_cuit: input.docTipo !== 99 ? String(input.docNro) : null,
    concepto: CONCEPTO_TXT[input.concepto] ?? null,
    monto: total,
    numero_comprobante: numero,
    tipo_comprobante: 'C',
    cae: cae.cae,
    cae_vencimiento: isoDesdeYmd(cae.caeVto),
    punto_venta: pad(input.ptoVta, 5),
    items: (input.items ?? null) as unknown as Json,
    iva_receptor: input.condicionIvaReceptor ?? null,
    periodo_desde: isoDesdeYmd(input.fchServDesde),
    periodo_hasta: isoDesdeYmd(input.fchServHasta),
    vto_pago: isoDesdeYmd(input.fchVtoPago),
  }).select('id').maybeSingle()

  return { cae, numero, id: data?.id ?? null }
}
