// ─── POST /api/monotributo/clientes/importar ─────────────────────────────────
// Siembra la libreta con los nombres de las facturas ya cargadas (los que no
// son genéricos). Idempotente: no duplica los que ya están.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

// Nombres genéricos que NO son clientes reales.
const GENERICO = /^(consumidor final|(cuit|dni|cuil|doc)\s+\d)/i

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [{ data: facturas }, { data: existentes }] = await Promise.all([
    supabase.from('facturas_emitidas').select('cliente').eq('user_id', user.id),
    supabase.from('clientes').select('nombre').eq('user_id', user.id),
  ])

  const ya = new Set((existentes ?? []).map(c => c.nombre))
  const nombres = new Set<string>()
  for (const f of facturas ?? []) {
    const n = (f.cliente ?? '').trim()
    if (n && !GENERICO.test(n) && !ya.has(n)) nombres.add(n)
  }

  if (nombres.size === 0) return NextResponse.json({ importados: 0 })
  const { error } = await supabase.from('clientes').insert([...nombres].map(nombre => ({ user_id: user.id, nombre })))
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ importados: nombres.size })
}
