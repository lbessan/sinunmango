// ─── lib/afip/sync.ts ────────────────────────────────────────────────────────
//
// Sincroniza el monotributo directo de AFIP con el certificado del usuario
// (sin terceros): WSAA → constancia → categoría, + escala pública → tope/cuota,
// y lo vuelca a monotributo_config. Reemplaza el robot de clave fiscal.
//
// El padrón NO trae la facturación acumulada — eso vendrá de wsfe (comprobantes).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { loginWSAA, type TA, type Ambiente } from '@/lib/afip/wsaa'
import { consultarConstancia, SERVICIO_CONSTANCIA, type DatosMonotributo } from '@/lib/afip/padron'
import { fetchEscala, type EscalaRow } from '@/lib/monotributo-escala'

type DB = SupabaseClient<Database>

export type ConfigResuelta = {
  categoria: string
  limite_facturacion_anual: number
  costo_mensual: number
  actividad: 'servicios' | 'venta_bienes'
}

/** Combina la categoría (constancia) con los montos de la escala pública de AFIP. */
export function resolverConfig(datos: DatosMonotributo, escala: EscalaRow[]): ConfigResuelta | null {
  if (!datos.categoria) return null
  const row = escala.find(r => r.categoria === datos.categoria)
  if (!row) return null
  // La descripción ("H LOCACIONES DE SERVICIOS" / "… VENTA DE COSAS MUEBLES")
  // nos dice si es servicios o bienes, que cambia la cuota.
  const desc = (datos.descripcionCategoria ?? '').toUpperCase()
  const esBienes = /VENTA|BIENES|MUEBLE/.test(desc)
  return {
    categoria: datos.categoria,
    limite_facturacion_anual: row.limite_anual,
    costo_mensual: esBienes ? row.cuota_bienes : row.cuota_servicios,
    actividad: esBienes ? 'venta_bienes' : 'servicios',
  }
}

// ── Cache del TA (token+sign encriptados) por servicio ──
type TACacheEntry = { t: string; s: string; expira: string }

function leerTACache(raw: unknown, service: string): TA | null {
  const cache = (raw ?? {}) as Record<string, TACacheEntry>
  const e = cache[service]
  if (!e?.expira || Date.parse(e.expira) < Date.now() + 60_000) return null // margen 1 min
  const token = decryptSecret(e.t)
  const sign = decryptSecret(e.s)
  return token && sign ? { token, sign, expira: e.expira } : null
}

function escribirTACache(raw: unknown, service: string, ta: TA): Json {
  const cache = { ...((raw ?? {}) as Record<string, TACacheEntry>) }
  cache[service] = { t: encryptSecret(ta.token), s: encryptSecret(ta.sign), expira: ta.expira }
  return cache as unknown as Json
}

export type SyncDeps = {
  loginWSAA: typeof loginWSAA
  consultarConstancia: typeof consultarConstancia
  fetchEscala: typeof fetchEscala
}
const defaultDeps: SyncDeps = { loginWSAA, consultarConstancia, fetchEscala }

/**
 * Sincroniza la categoría del monotributo con el certificado guardado.
 * Devuelve los datos leídos y si actualizó la config. Tira si no hay cert o
 * si AFIP rechaza (ej. cert vencido / WSAA no autorizado).
 */
export async function sincronizarPorCert(
  supabase: DB,
  userId: string,
  deps: SyncDeps = defaultDeps,
): Promise<{ datos: DatosMonotributo; configActualizada: boolean }> {
  const { data: conx } = await supabase
    .from('afip_conexion')
    .select('cuit, ambiente, cert_cipher, key_cipher, ta_cache')
    .eq('user_id', userId)
    .maybeSingle()

  if (!conx?.cert_cipher || !conx?.key_cipher) throw new Error('No hay un certificado conectado')
  const certPem = decryptSecret(conx.cert_cipher)
  const keyPem = decryptSecret(conx.key_cipher)
  if (!certPem || !keyPem) throw new Error('No se pudo descifrar el certificado')
  const ambiente: Ambiente = conx.ambiente === 'homologacion' ? 'homologacion' : 'produccion'

  // TA: de cache si sigue válido, si no login WSAA (y lo cacheamos).
  let ta = leerTACache(conx.ta_cache, SERVICIO_CONSTANCIA)
  if (!ta) {
    ta = await deps.loginWSAA({ service: SERVICIO_CONSTANCIA, certPem, keyPem, ambiente })
    await supabase.from('afip_conexion')
      .update({ ta_cache: escribirTACache(conx.ta_cache, SERVICIO_CONSTANCIA, ta) })
      .eq('user_id', userId)
  }

  const datos = await deps.consultarConstancia({ ta, cuit: conx.cuit, ambiente })

  // Categoría + escala pública → config.
  let configActualizada = false
  const cfg = resolverConfig(datos, (await deps.fetchEscala()).escala)
  if (cfg) configActualizada = await escribirConfig(supabase, userId, cfg)

  await supabase.from('afip_conexion').update({
    estado: 'conectado',
    metodo: 'certificado',
    sync_data: datos as unknown as Json,
    sync_error: null,
    ultima_sync: new Date().toISOString(),
  }).eq('user_id', userId)

  return { datos, configActualizada }
}

/** Escribe categoría/tope/cuota/actividad en monotributo_config (update o insert). */
async function escribirConfig(supabase: DB, userId: string, cfg: ConfigResuelta): Promise<boolean> {
  const { data: existing } = await supabase
    .from('monotributo_config').select('user_id').eq('user_id', userId).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('monotributo_config').update({
      categoria: cfg.categoria,
      limite_facturacion_anual: cfg.limite_facturacion_anual,
      costo_mensual: cfg.costo_mensual,
      actividad: cfg.actividad,
    }).eq('user_id', userId)
    return !error
  }
  const { error } = await supabase.from('monotributo_config').insert({
    user_id: userId,
    categoria: cfg.categoria,
    limite_facturacion_anual: cfg.limite_facturacion_anual,
    costo_mensual: cfg.costo_mensual,
    actividad: cfg.actividad,
    vigente_desde: new Date().toISOString().slice(0, 10),
  })
  return !error
}
