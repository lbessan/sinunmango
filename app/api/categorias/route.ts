import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('categorias')
    .select('id, nombre_categoria, icono, tipo_default')
    .eq('user_id', user.id)
    .order('tipo_default')
    .order('nombre_categoria')

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const id = crypto.randomUUID()

  const { error } = await supabase.from('categorias').insert({
    id,
    nombre_categoria: body.nombre_categoria,
    tipo_default:     body.tipo_default ?? 'Gasto',
    icono:            body.icono ?? null,
    user_id:          user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { id, ...data } = body

  const { error } = await supabase
    .from('categorias')
    .update(data)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await req.json()
  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
