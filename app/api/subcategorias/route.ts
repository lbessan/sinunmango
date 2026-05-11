import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import {
  validateString, validateId,
  type Validated,
} from '@/lib/validators'

type SubcategoriaInsert = {
  nombre_subcategoria: string
  categoria_padre:     string | null
  icono:               string | null
}

function validateSubcategoria(raw: unknown): Validated<SubcategoriaInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const nombre = validateString(b.nombre_subcategoria, { max: 50, field: 'nombre_subcategoria' })
  if (!nombre.ok) return nombre

  let categoria_padre: string | null = null
  if (b.categoria_padre !== undefined && b.categoria_padre !== null && b.categoria_padre !== '') {
    const v = validateId(b.categoria_padre, 'categoria_padre')
    if (!v.ok) return v
    categoria_padre = v.data
  }

  let icono: string | null = null
  if (b.icono !== undefined && b.icono !== null && b.icono !== '') {
    const v = validateString(b.icono, { min: 1, max: 10, field: 'icono' })
    if (!v.ok) return v
    icono = v.data
  }

  return { ok: true, data: { nombre_subcategoria: nombre.data, categoria_padre, icono } }
}

function validateSubcategoriaUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre_subcategoria !== undefined) {
    const v = validateString(b.nombre_subcategoria, { max: 50, field: 'nombre_subcategoria' })
    if (!v.ok) return v
    updates.nombre_subcategoria = v.data
  }
  if (b.categoria_padre !== undefined) {
    if (b.categoria_padre === null || b.categoria_padre === '') {
      updates.categoria_padre = null
    } else {
      const v = validateId(b.categoria_padre, 'categoria_padre')
      if (!v.ok) return v
      updates.categoria_padre = v.data
    }
  }
  if (b.icono !== undefined) {
    if (b.icono === null || b.icono === '') {
      updates.icono = null
    } else {
      const v = validateString(b.icono, { min: 1, max: 10, field: 'icono' })
      if (!v.ok) return v
      updates.icono = v.data
    }
  }

  return { ok: true, data: updates }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await createClientForRequest(req)
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

    const v = validateSubcategoria(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const id = `subcat_${nanoid(8)}`
    const { data, error } = await supabase
      .from('subcategorias')
      .insert({ id, ...v.data, user_id: user.id })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user } = await createClientForRequest(req)
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
    if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

    const { id, ...rest } = body as Record<string, unknown>
    const idCheck = validateId(id, 'id')
    if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 })

    const v = validateSubcategoriaUpdate(rest)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    if (Object.keys(v.data).length === 0) {
      return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('subcategorias')
      .update(v.data as never)
      .eq('id', idCheck.data)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
