import { createClientForRequest } from '@/lib/supabase/route'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateISODate,
  isPlainObject,
  type Validated,
} from '@/lib/validators'

const ESTADOS = ['activo', 'vencido', 'liquidado'] as const

function validateInversionUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre !== undefined) {
    if (b.nombre === null || b.nombre === '') {
      updates.nombre = null
    } else {
      const v = validateString(b.nombre, { max: 100, field: 'nombre' })
      if (!v.ok) return v
      updates.nombre = v.data
    }
  }
  if (b.fecha_vencimiento !== undefined) {
    if (b.fecha_vencimiento === null || b.fecha_vencimiento === '') {
      updates.fecha_vencimiento = null
    } else {
      const v = validateISODate(b.fecha_vencimiento, 'fecha_vencimiento')
      if (!v.ok) return v
      updates.fecha_vencimiento = v.data
    }
  }
  if (b.valor_actual !== undefined) {
    const v = validatePositiveNumber(b.valor_actual, { max: 10_000_000_000, allowZero: true, field: 'valor_actual' })
    if (!v.ok) return v
    updates.valor_actual = v.data
  }
  if (b.estado !== undefined) {
    const v = validateEnum(b.estado, ESTADOS, 'estado')
    if (!v.ok) return v
    updates.estado = v.data
  }
  if (b.datos !== undefined) {
    if (b.datos === null) {
      updates.datos = {}
    } else if (isPlainObject(b.datos)) {
      updates.datos = b.datos
    } else {
      return { ok: false, error: 'datos debe ser un objeto' }
    }
  }
  if (b.notas !== undefined) {
    if (b.notas === null || b.notas === '') {
      updates.notas = null
    } else {
      const v = validateString(b.notas, { max: 1000, field: 'notas' })
      if (!v.ok) return v
      updates.notas = v.data
    }
  }
  // Campos NO permitidos via PATCH (inmutables después de creación):
  //   - tipo, capital_inicial, fecha_inicio, moneda, movimiento_origen_id, user_id

  return { ok: true, data: updates }
}

// ─── PATCH /api/inversiones/[id] ──────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateInversionUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  // Verificar que la inversión pertenece al usuario antes de actualizar
  const { data: existing } = await supabase
    .from('inversiones')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('inversiones')
    .update(v.data as never)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// ─── DELETE /api/inversiones/[id] ─────────────────────────────────────────────
// Soft delete: marca como 'liquidado', no borra el registro ni el movimiento de origen.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('inversiones')
    .update({ estado: 'liquidado' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/inversiones')
  return NextResponse.json({ ok: true })
}
