// ─── GET /api/monotributo/afip/consultar-cuit?cuit=XX ─────────────────────────
// Trae el nombre/razón social de un CUIT desde el padrón de AFIP (con el cert),
// para autocompletar un cliente.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { normalizarCuit } from '@/lib/afip-cert'
import { cargarCert, obtenerTA } from '@/lib/afip/ta'
import { SERVICIO_CONSTANCIA, consultarPersona } from '@/lib/afip/padron'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let cuit: string
  try { cuit = normalizarCuit(new URL(req.url).searchParams.get('cuit') ?? '') }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  try {
    const cert = await cargarCert(supabase, user.id)
    const ta = await obtenerTA(supabase, user.id, SERVICIO_CONSTANCIA, cert)
    const persona = await consultarPersona({ ta, cuitConsultante: cert.cuit, cuit, ambiente: cert.ambiente })
    if (!persona.nombre) return NextResponse.json({ error: 'No se encontró ese CUIT en el padrón' }, { status: 404 })
    return NextResponse.json({ nombre: persona.nombre, tipoPersona: persona.tipoPersona, docTipo: 80, docNro: cuit })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo consultar el CUIT' }, { status: 400 })
  }
}
