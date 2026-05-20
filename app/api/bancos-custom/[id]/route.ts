import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateHexColor,
  type Validated,
} from '@/lib/validators'

const BANCO_TIPOS = ['banco', 'billetera', 'crypto'] as const

function validateBancoUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre !== undefined) {
    const v = validateString(b.nombre, { max: 50, field: 'nombre' })
    if (!v.ok) return v
    updates.nombre = v.data
  }
  if (b.color !== undefined) {
    const v = validateHexColor(b.color, 'color')
    if (!v.ok) return v
    updates.color = v.data
  }
  if (b.tipo !== undefined) {
    if (typeof b.tipo !== 'string' || !(BANCO_TIPOS as readonly string[]).includes(b.tipo)) {
      return { ok: false, error: 'tipo inválido — debe ser banco, billetera o crypto' }
    }
    updates.tipo = b.tipo
  }
  if (b.imagen_url !== undefined) {
    if (b.imagen_url === null || b.imagen_url === '') {
      updates.imagen_url = null
    } else {
      const v = validateString(b.imagen_url, { max: 500, field: 'imagen_url' })
      if (!v.ok) return v
      updates.imagen_url = v.data
    }
  }
  if (b.imagen_banner_url !== undefined) {
    if (b.imagen_banner_url === null || b.imagen_banner_url === '') {
      updates.imagen_banner_url = null
    } else {
      const v = validateString(b.imagen_banner_url, { max: 500, field: 'imagen_banner_url' })
      if (!v.ok) return v
      updates.imagen_banner_url = v.data
    }
  }

  return { ok: true, data: updates }
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

  const v = validateBancoUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('bancos_custom')
    .update(v.data as never)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('bancos_custom')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
