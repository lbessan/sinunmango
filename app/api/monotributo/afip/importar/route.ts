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
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudieron traer las facturas' }, { status: 400 })
  }
}
