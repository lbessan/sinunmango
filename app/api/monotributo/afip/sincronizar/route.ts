// ─── POST /api/monotributo/afip/sincronizar ──────────────────────────────────
//
// Sincroniza con el CERTIFICADO del usuario, directo a AFIP — sin terceros:
//   1. categoría (WSAA + Constancia de Inscripción)
//   2. facturas emitidas por web service (wsfe)
//
// Los dos en la misma acción: "actualizar" tiene que dejar el monotributo al
// día, no solo la categoría. El paso 2 es best-effort — que wsfe falle no
// invalida la categoría que ya trajimos — pero SIEMPRE se informa (`facturas`),
// nunca se traga en silencio.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { sincronizarPorCert } from '@/lib/afip/sync'
import { importarComprobantes } from '@/lib/afip/comprobantes'
import { esNoAutorizado } from '@/lib/afip/wsaa'

export const maxDuration = 60

type EstadoFacturas =
  | { estado: 'ok'; importadas: number }
  | { estado: 'sin_comprobantes'; aviso: string }
  | { estado: 'error'; aviso: string }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const { datos, configActualizada } = await sincronizarPorCert(supabase, user.id)

    let facturas: EstadoFacturas
    try {
      const r = await importarComprobantes(supabase, user.id)
      facturas = r.sinComprobantes
        ? {
            estado: 'sin_comprobantes',
            aviso: 'AFIP no tiene comprobantes emitidos por web service. Si facturás desde "Comprobantes en línea", con el certificado no se pueden leer: importá el CSV de Mis Comprobantes o emití desde la app.',
          }
        : { estado: 'ok', importadas: r.importados }
    } catch (e) {
      facturas = { estado: 'error', aviso: (e as Error).message.slice(0, 300) }
    }

    return NextResponse.json({ ok: true, datos, configActualizada, facturas })
  } catch (e) {
    const msg = (e as Error).message || 'No se pudo sincronizar con AFIP'
    // Dejar registro del error para el cron / la UI (best-effort).
    await supabase.from('afip_conexion').update({ sync_error: msg.slice(0, 500) }).eq('user_id', user.id)
    return NextResponse.json({ error: msg, noAutorizado: esNoAutorizado(msg) }, { status: 400 })
  }
}
