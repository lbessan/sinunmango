// POST /api/monotributo/afip/guardar-certificado
// Recibe el certificado (PEM) que devolvió AFIP, lo valida (formato + vigencia),
// lo guarda ENCRIPTADO y marca la conexión como 'conectado'.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { inspeccionarCertificado, certificadoMatcheaKey } from '@/lib/afip-cert'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const certPem = String((body as Record<string, unknown>)?.certPem ?? '').trim()
  if (!certPem) return NextResponse.json({ error: 'Falta el certificado' }, { status: 400 })

  const insp = inspeccionarCertificado(certPem)
  if (!insp.ok) return NextResponse.json({ error: `Certificado inválido: ${insp.error}` }, { status: 400 })
  if (insp.vencido) return NextResponse.json({ error: 'El certificado está vencido' }, { status: 400 })

  // Verificar que el cert corresponde a la clave privada que tenemos guardada:
  // si no matchea, no podríamos firmar con él (te lo generó desde otra solicitud).
  const { data: conx } = await supabase
    .from('afip_conexion').select('key_cipher').eq('user_id', user.id).maybeSingle()
  const keyPem = conx?.key_cipher ? decryptSecret(conx.key_cipher) : null
  if (!keyPem) {
    return NextResponse.json(
      { error: 'No encontramos tu clave privada. Generá primero la solicitud (CSR) y después pegá el certificado que corresponda a esa solicitud.' },
      { status: 400 },
    )
  }
  if (!certificadoMatcheaKey(certPem, keyPem)) {
    return NextResponse.json(
      { error: 'Este certificado no corresponde a tu solicitud actual. Volvé a "Generar solicitud", subí ESA a AFIP y pegá el certificado que te devuelve (sin generar otra solicitud en el medio).' },
      { status: 400 },
    )
  }

  let cert_cipher: string
  try { cert_cipher = encryptSecret(certPem) }
  catch { return NextResponse.json({ error: 'Falta la key de encriptación en el server' }, { status: 500 }) }

  const { error } = await supabase.from('afip_conexion')
    .update({ cert_cipher, cert_not_after: insp.notAfter, estado: 'conectado', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, notAfter: insp.notAfter })
}
