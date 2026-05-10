import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)
    .order('nombre_cuenta')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const id   = 'tar_' + Date.now().toString(36)

  // user_id y tipo_cuenta van después del spread para que el body no pueda pisarlos
  const { error } = await supabase.from('cuentas').insert({
    id,
    ...body,
    tipo_cuenta: 'Tarjeta Credito',
    user_id:     user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
