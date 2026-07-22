// ─── /api/monotributo/clientes ───────────────────────────────────────────────
// GET  → lista los clientes del usuario.
// POST → crea/actualiza un cliente (dedup por nombre).

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data } = await supabase.from('clientes').select('*').eq('user_id', user.id).order('nombre')
  return NextResponse.json({ clientes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>

  const nombre = String(raw.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre del cliente' }, { status: 400 })
  const doc_tipo = raw.doc_tipo != null && raw.doc_tipo !== '' ? Number(raw.doc_tipo) : null
  const doc_nro = raw.doc_nro != null ? (String(raw.doc_nro).replace(/\D/g, '') || null) : null
  const condicion_iva = raw.condicion_iva != null && raw.condicion_iva !== '' ? Number(raw.condicion_iva) : null

  const { data, error } = await supabase.from('clientes').upsert(
    { user_id: user.id, nombre, doc_tipo, doc_nro, condicion_iva, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,nombre' },
  ).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ cliente: data })
}
