import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.nombre_subcategoria?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const id = `subcat_${nanoid(8)}`

    const { data, error } = await adminClient.from('subcategorias').insert({
      id,
      nombre_subcategoria: body.nombre_subcategoria.trim(),
      categoria_padre:     body.categoria_padre ?? null,
      icono:               body.icono ?? null,          // ← nuevo campo
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })

  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    if (body.nombre_subcategoria !== undefined) updates.nombre_subcategoria = body.nombre_subcategoria.trim()
    if (body.categoria_padre     !== undefined) updates.categoria_padre     = body.categoria_padre
    if (body.icono               !== undefined) updates.icono               = body.icono  // ← nuevo campo

    const { data, error } = await adminClient
      .from('subcategorias')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)

  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
