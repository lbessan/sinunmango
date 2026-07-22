// ─── POST /api/monotributo/afip/sincronizar ──────────────────────────────────
//
// Sincroniza la categoría del monotributo con el CERTIFICADO del usuario,
// directo a AFIP (WSAA + Constancia de Inscripción) — sin servicios de terceros.
// Rápido (SOAP), así que va inline (sin fire-and-poll).

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { sincronizarPorCert } from '@/lib/afip/sync'
import { esNoAutorizado } from '@/lib/afip/wsaa'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const { datos, configActualizada } = await sincronizarPorCert(supabase, user.id)
    return NextResponse.json({ ok: true, datos, configActualizada })
  } catch (e) {
    const msg = (e as Error).message || 'No se pudo sincronizar con AFIP'
    // Dejar registro del error para el cron / la UI (best-effort).
    await supabase.from('afip_conexion').update({ sync_error: msg.slice(0, 500) }).eq('user_id', user.id)
    return NextResponse.json({ error: msg, noAutorizado: esNoAutorizado(msg) }, { status: 400 })
  }
}
