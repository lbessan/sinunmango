import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validateId,
  type Validated,
} from '@/lib/validators'

const TIPOS_DEFAULT = ['Gasto', 'Ingreso', 'Transferencia'] as const

type CategoriaInsert = {
  nombre_categoria: string
  tipo_default:     'Gasto' | 'Ingreso' | 'Transferencia'
  icono:            string | null
}

function validateCategoria(raw: unknown): Validated<CategoriaInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const nombre = validateString(b.nombre_categoria, { max: 50, field: 'nombre_categoria' })
  if (!nombre.ok) return nombre

  // tipo_default es opcional con default 'Gasto'
  let tipoDefault: typeof TIPOS_DEFAULT[number] = 'Gasto'
  if (b.tipo_default !== undefined && b.tipo_default !== null) {
    const v = validateEnum(b.tipo_default, TIPOS_DEFAULT, 'tipo_default')
    if (!v.ok) return v
    tipoDefault = v.data
  }

  // icono: PascalCase Lucide (ej "ShoppingBag") o emoji Unicode (ej "🛒"). Max 60.
  let icono: string | null = null
  if (b.icono !== undefined && b.icono !== null && b.icono !== '') {
    const v = validateString(b.icono, { min: 1, max: 60, field: 'icono' })
    if (!v.ok) return v
    icono = v.data
  }

  return {
    ok: true,
    data: { nombre_categoria: nombre.data, tipo_default: tipoDefault, icono },
  }
}

function validateCategoriaUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre_categoria !== undefined) {
    const v = validateString(b.nombre_categoria, { max: 50, field: 'nombre_categoria' })
    if (!v.ok) return v
    updates.nombre_categoria = v.data
  }
  if (b.tipo_default !== undefined) {
    const v = validateEnum(b.tipo_default, TIPOS_DEFAULT, 'tipo_default')
    if (!v.ok) return v
    updates.tipo_default = v.data
  }
  if (b.icono !== undefined) {
    if (b.icono === null || b.icono === '') {
      updates.icono = null
    } else {
      const v = validateString(b.icono, { min: 1, max: 60, field: 'icono' })
      if (!v.ok) return v
      updates.icono = v.data
    }
  }

  return { ok: true, data: updates }
}

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

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateCategoria(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const id = crypto.randomUUID()
  const { error } = await supabase.from('categorias').insert({ id, ...v.data, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { id, ...rest } = body as Record<string, unknown>
  const idCheck = validateId(id, 'id')
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 })

  const v = validateCategoriaUpdate(rest)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('categorias')
    .update(v.data as never)
    .eq('id', idCheck.data)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const idCheck = validateId((body as Record<string, unknown>).id, 'id')
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 })

  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', idCheck.data)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
