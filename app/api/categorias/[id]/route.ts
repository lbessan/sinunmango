import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum,
  type Validated,
} from '@/lib/validators'

const TIPOS_DEFAULT = ['Gasto', 'Ingreso', 'Transferencia'] as const

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateCategoriaUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('categorias')
    .update(v.data as never)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
