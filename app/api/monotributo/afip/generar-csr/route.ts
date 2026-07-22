// POST /api/monotributo/afip/generar-csr
// Genera (o reusa) el keypair + CSR para subir a AFIP (WSASS). La clave privada
// queda ENCRIPTADA; devuelve el CSR para copiar/descargar.
//
// Reusa la key pendiente (si hay una sin cert guardado) en vez de generar una
// nueva: así re-clickear "Generar solicitud" no deja huérfano un certificado ya
// emitido con la key anterior. Al guardar el cert se valida que corresponda.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/database.types'
import { generarKeypairYCsr, csrDesdeKeyPem, normalizarCuit } from '@/lib/afip-cert'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

const ALIAS = 'sinunmango'

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>

  let cuit: string
  try { cuit = normalizarCuit(String(raw.cuit ?? '')) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  const nombre = typeof raw.nombre === 'string' && raw.nombre.trim() ? raw.nombre : ALIAS

  // ¿Hay una key pendiente (sin cert todavía)? La reusamos.
  const { data: existing } = await supabase
    .from('afip_conexion').select('key_cipher, cert_cipher').eq('user_id', user.id).maybeSingle()
  const keyPendiente = existing?.key_cipher && !existing?.cert_cipher
    ? decryptSecret(existing.key_cipher) : null

  let csrPem: string
  let key_cipher: string | undefined
  try {
    if (keyPendiente) {
      csrPem = csrDesdeKeyPem(keyPendiente, cuit, nombre, ALIAS)
    } else {
      const gen = generarKeypairYCsr(cuit, nombre, ALIAS)
      csrPem = gen.csrPem
      key_cipher = encryptSecret(gen.privateKeyPem)
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo generar la solicitud' }, { status: 400 })
  }

  const patch: Database['public']['Tables']['afip_conexion']['Insert'] = {
    user_id: user.id, cuit, alias: ALIAS, estado: 'pendiente', cert_cipher: null, cert_not_after: null,
  }
  if (key_cipher) patch.key_cipher = key_cipher // solo si generamos una key nueva

  const { error } = await supabase.from('afip_conexion').upsert(patch, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ csr: csrPem, alias: ALIAS, cuit })
}
