import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const id   = 'cat_' + Date.now().toString(36)

  const { error } = await adminClient.from('categorias').insert({
    id,
    nombre_categoria: body.nombre_categoria,
    tipo_default:     body.tipo_default ?? 'Gasto',
    icono:            body.icono ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...data } = body

  const { error } = await adminClient.from('categorias').update(data).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
