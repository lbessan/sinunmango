import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const id   = 'fijo_' + Date.now().toString(36)

  const { error } = await supabase.from('gastos_fijos').insert({ id, ...body, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
