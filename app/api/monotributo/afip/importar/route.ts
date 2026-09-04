// ─── POST /api/monotributo/afip/importar ─────────────────────────────────────
//
// Trae las Facturas C emitidas desde AFIP (wsfe) y las guarda en facturas_emitidas.
// Idempotente: solo agrega las que faltan.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { importarComprobantes } from '@/lib/afip/comprobantes'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const r = await importarComprobantes(supabase, user.id)
    // Sin comprobantes en wsfe no es "estás al día": es que facturás por otro
    // lado (Comprobantes en línea), que el certificado no puede leer.
    const aviso = r.sinComprobantes
      ? 'AFIP no tiene comprobantes emitidos por web service. Si facturás desde "Comprobantes en línea", importá el CSV de Mis Comprobantes — con el certificado no se pueden leer.'
      : null
    return NextResponse.json({ ok: true, ...r, aviso })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudieron traer las facturas' }, { status: 400 })
  }
}
