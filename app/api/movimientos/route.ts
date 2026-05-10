import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const records = await req.json()
  // user_id se setea siempre desde el server, NUNCA del body (defensa contra spoofing).
  // Va al final del spread para sobrescribir cualquier user_id que venga del cliente.
  const withUser = Array.isArray(records)
    ? records.map(r => ({ ...r, user_id: user.id }))
    : { ...records, user_id: user.id }

  const { error } = await supabase.from('movimientos').insert(withUser)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
