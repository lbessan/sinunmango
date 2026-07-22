// ─── lib/afip/ta.ts ──────────────────────────────────────────────────────────
//
// Helpers compartidos para el certificado + el cache del TA de WSAA, usados
// tanto por la lectura de categoría (padrón) como por la facturación (wsfe).
//
// El TA (token+sign) vale ~12h y AFIP no lo re-emite mientras siga vigente, así
// que se cachea por servicio en afip_conexion.ta_cache (token/sign encriptados).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { loginWSAA, type TA, type Ambiente } from '@/lib/afip/wsaa'

type DB = SupabaseClient<Database>

export type CertData = {
  cuit: string
  certPem: string
  keyPem: string
  ambiente: Ambiente
  ta_cache: unknown
}

/** Carga y descifra el certificado + clave del usuario. Tira si no hay o no descifra. */
export async function cargarCert(supabase: DB, userId: string): Promise<CertData> {
  const { data } = await supabase
    .from('afip_conexion')
    .select('cuit, ambiente, cert_cipher, key_cipher, ta_cache')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data?.cert_cipher || !data?.key_cipher) throw new Error('No hay un certificado conectado')
  const certPem = decryptSecret(data.cert_cipher)
  const keyPem = decryptSecret(data.key_cipher)
  if (!certPem || !keyPem) throw new Error('No se pudo descifrar el certificado')
  return {
    cuit: data.cuit,
    certPem,
    keyPem,
    ambiente: data.ambiente === 'homologacion' ? 'homologacion' : 'produccion',
    ta_cache: data.ta_cache,
  }
}

type TACacheEntry = { t: string; s: string; expira: string }

export function leerTACache(raw: unknown, service: string): TA | null {
  const cache = (raw ?? {}) as Record<string, TACacheEntry>
  const e = cache[service]
  if (!e?.expira || Date.parse(e.expira) < Date.now() + 60_000) return null
  const token = decryptSecret(e.t)
  const sign = decryptSecret(e.s)
  return token && sign ? { token, sign, expira: e.expira } : null
}

export function escribirTACache(raw: unknown, service: string, ta: TA): Json {
  const cache = { ...((raw ?? {}) as Record<string, TACacheEntry>) }
  cache[service] = { t: encryptSecret(ta.token), s: encryptSecret(ta.sign), expira: ta.expira }
  return cache as unknown as Json
}

/**
 * Devuelve un TA para el servicio: del cache si sigue válido, si no hace login
 * WSAA y lo cachea. `login` es inyectable para tests.
 */
export async function obtenerTA(
  supabase: DB,
  userId: string,
  service: string,
  cert: Pick<CertData, 'certPem' | 'keyPem' | 'ambiente' | 'ta_cache'>,
  login: typeof loginWSAA = loginWSAA,
): Promise<TA> {
  const cached = leerTACache(cert.ta_cache, service)
  if (cached) return cached
  const ta = await login({ service, certPem: cert.certPem, keyPem: cert.keyPem, ambiente: cert.ambiente })
  await supabase
    .from('afip_conexion')
    .update({ ta_cache: escribirTACache(cert.ta_cache, service, ta) })
    .eq('user_id', userId)
  return ta
}
