// ─── lib/afip/facturacion.ts ─────────────────────────────────────────────────
//
// Emite Facturas C por wsfe con el certificado del usuario y las guarda en
// facturas_emitidas (con su CAE). Directo a AFIP, sin terceros.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
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

/** Lista los puntos de venta habilitados para Web Services. */
export async function puntosDeVenta(supabase: DB, userId: string, deps: FacturaDeps = defaultDeps): Promise<PuntoVenta[]> {
  const cert = await cargarCert(supabase, userId)
  const ta = await obtenerTA(supabase, userId, SERVICIO_WSFE, cert, deps.loginWSAA)
  return deps.listarPuntosVenta({ ta, cuit: cert.cuit, ambiente: cert.ambiente })
}

export type EmitirInput = {
  ptoVta: number
  concepto: 1 | 2 | 3 // 1 productos, 2 servicios, 3 ambos
  docTipo: number // 80 CUIT, 96 DNI, 99 consumidor final
  docNro: number
  importe: number
  cliente: string // nombre/razón social para guardar
  fecha?: string // YYYYMMDD
  fchServDesde?: string
  fchServHasta?: string
  fchVtoPago?: string
}

const isoDesdeYmd = (ymd?: string): string | null =>
  ymd && ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : null

const CONCEPTO_TXT: Record<number, string> = { 1: 'productos', 2: 'servicios', 3: 'productos y servicios' }

/**
 * Emite una Factura C y la guarda en facturas_emitidas con su CAE.
 * Devuelve el CAE y el número formateado ("00003-00000001"). Tira si AFIP rechaza.
 */
export async function emitirYGuardar(
  supabase: DB,
  userId: string,
  input: EmitirInput,
  deps: FacturaDeps = defaultDeps,
): Promise<{ cae: CaeResult; numero: string }> {
  const cert = await cargarCert(supabase, userId)
  const ta = await obtenerTA(supabase, userId, SERVICIO_WSFE, cert, deps.loginWSAA)

  const factura: FacturaC = {
    ptoVta: input.ptoVta,
    concepto: input.concepto,
    docTipo: input.docTipo,
    docNro: input.docNro,
    importe: input.importe,
    fecha: input.fecha,
    fchServDesde: input.fchServDesde,
    fchServHasta: input.fchServHasta,
    fchVtoPago: input.fchVtoPago,
  }
  const cae = await deps.emitirFacturaC({ ta, cuit: cert.cuit, ambiente: cert.ambiente, factura })

  const numero = `${String(input.ptoVta).padStart(5, '0')}-${String(cae.cbteNro).padStart(8, '0')}`
  await supabase.from('facturas_emitidas').insert({
    user_id: userId,
    fecha: isoDesdeYmd(input.fecha) ?? new Date().toISOString().slice(0, 10),
    cliente: input.cliente.trim() || 'Consumidor final',
    concepto: CONCEPTO_TXT[input.concepto] ?? null,
    monto: input.importe,
    numero_comprobante: numero,
    tipo_comprobante: 'C',
    cae: cae.cae,
    cae_vencimiento: isoDesdeYmd(cae.caeVto),
    punto_venta: String(input.ptoVta).padStart(5, '0'),
  })

  return { cae, numero }
}
