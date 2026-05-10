import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateInteger,
  validateBoolean, validateId,
  type Validated,
} from '@/lib/validators'

const MONEDAS = ['ARS', 'USD'] as const

function validateGastoFijoUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre_gasto !== undefined) {
    const v = validateString(b.nombre_gasto, { max: 100, field: 'nombre_gasto' })
    if (!v.ok) return v
    updates.nombre_gasto = v.data
  }
  if (b.monto_estimado !== undefined) {
    const v = validatePositiveNumber(b.monto_estimado, { max: 1_000_000_000, field: 'monto_estimado' })
    if (!v.ok) return v
    updates.monto_estimado = v.data
  }
  if (b.moneda !== undefined) {
    const v = validateEnum(b.moneda, MONEDAS, 'moneda')
    if (!v.ok) return v
    updates.moneda = v.data
  }
  if (b.dia_vencimiento !== undefined) {
    if (b.dia_vencimiento === null) {
      updates.dia_vencimiento = null
    } else {
      const v = validateInteger(b.dia_vencimiento, { min: 1, max: 31, field: 'dia_vencimiento' })
      if (!v.ok) return v
      updates.dia_vencimiento = v.data
    }
  }
  if (b.cuenta_pago_default !== undefined) {
    if (b.cuenta_pago_default === null) {
      updates.cuenta_pago_default = null
    } else {
      const v = validateId(b.cuenta_pago_default, 'cuenta_pago_default')
      if (!v.ok) return v
      updates.cuenta_pago_default = v.data
    }
  }
  if (b.id_categoria !== undefined) {
    if (b.id_categoria === null) {
      updates.id_categoria = null
    } else {
      const v = validateId(b.id_categoria, 'id_categoria')
      if (!v.ok) return v
      updates.id_categoria = v.data
    }
  }
  if (b.id_subcategoria !== undefined) {
    if (b.id_subcategoria === null) {
      updates.id_subcategoria = null
    } else {
      const v = validateId(b.id_subcategoria, 'id_subcategoria')
      if (!v.ok) return v
      updates.id_subcategoria = v.data
    }
  }
  if (b.activo !== undefined) {
    const v = validateBoolean(b.activo, 'activo')
    if (!v.ok) return v
    updates.activo = v.data
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

  const v = validateGastoFijoUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('gastos_fijos')
    .update(v.data)
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
    .from('gastos_fijos')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
