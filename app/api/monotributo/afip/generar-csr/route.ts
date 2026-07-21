// POST /api/monotributo/afip/generar-csr
// Genera el keypair + CSR para que el usuario lo suba a AFIP (WSASS). Guarda la
// clave privada ENCRIPTADA y devuelve el CSR (texto) para copiar/descargar.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { generarKeypairYCsr, normalizarCuit } from '@/lib/afip-cert'
import { encryptSecret } from '@/lib/crypto'

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

  let csrPem: string, privateKeyPem: string
  try { ({ csrPem, privateKeyPem } = generarKeypairYCsr(cuit, nombre, ALIAS)) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  let key_cipher: string
  try { key_cipher = encryptSecret(privateKeyPem) }
  catch { return NextResponse.json({ error: 'Falta la key de encriptación en el server' }, { status: 500 }) }

  const { error } = await supabase.from('afip_conexion').upsert(
    { user_id: user.id, cuit, alias: ALIAS, estado: 'pendiente', key_cipher, cert_cipher: null, cert_not_after: null },
    { onConflict: 'user_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ csr: csrPem, alias: ALIAS, cuit })
}
