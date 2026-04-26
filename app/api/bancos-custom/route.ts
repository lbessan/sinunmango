import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await adminClient
    .from('bancos_custom')
    .select('*')
    .eq('user_id', user.id)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const id   = 'banco_' + Date.now().toString(36)

  const { error } = await adminClient.from('bancos_custom').insert({
    id,
    user_id:          user.id,
    nombre:           body.nombre,
    color:            body.color ?? '#475569',
    imagen_url:       body.imagen_url ?? null,
    imagen_banner_url: body.imagen_banner_url ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
