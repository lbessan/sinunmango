import { createClientForRequest } from '@/lib/supabase/route'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateBoolean,
  validateInteger, validateISODate, validateId,
  type Validated,
} from '@/lib/validators'

const MONEDAS    = ['ARS', 'USD'] as const
const TIPOS_MOV  = ['Gasto', 'Ingreso', 'Transferencia'] as const
const MONTO_MAX  = 1_000_000_000
const CUOTAS_MAX = 60
const DETALLE_MAX = 500

// Campos que tiene sentido aplicar a TODAS las cuotas hermanas
// (los que NO están: fecha, periodo_tarjeta, cuota_actual, cuotas_total, detalle)
const CAMPOS_COMPARTIBLES = new Set([
  'monto', 'moneda', 'tipo_movimiento',
  'cuenta_origen', 'cuenta_destino',
  'categoria', 'subcategoria',
  'cotizacion', 'conciliado',
])

function validateMovimientoUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.fecha !== undefined) {
    const v = validateISODate(b.fecha, 'fecha')
    if (!v.ok) return v
    updates.fecha = v.data
  }
  if (b.monto !== undefined) {
    const v = validatePositiveNumber(b.monto, { max: MONTO_MAX, field: 'monto' })
    if (!v.ok) return v
    updates.monto = v.data
  }
  if (b.moneda !== undefined) {
    const v = validateEnum(b.moneda, MONEDAS, 'moneda')
    if (!v.ok) return v
    updates.moneda = v.data
  }
  if (b.tipo_movimiento !== undefined) {
    const v = validateEnum(b.tipo_movimiento, TIPOS_MOV, 'tipo_movimiento')
    if (!v.ok) return v
    updates.tipo_movimiento = v.data
  }
  if (b.detalle !== undefined) {
    if (b.detalle === null || b.detalle === '') {
      updates.detalle = null
    } else {
      const v = validateString(b.detalle, { max: DETALLE_MAX, field: 'detalle' })
      if (!v.ok) return v
      updates.detalle = v.data
    }
  }
  if (b.cuenta_origen !== undefined) {
    if (b.cuenta_origen === null) {
      updates.cuenta_origen = null
    } else {
      const v = validateId(b.cuenta_origen, 'cuenta_origen')
      if (!v.ok) return v
      updates.cuenta_origen = v.data
    }
  }
  if (b.cuenta_destino !== undefined) {
    if (b.cuenta_destino === null) {
      updates.cuenta_destino = null
    } else {
      const v = validateId(b.cuenta_destino, 'cuenta_destino')
      if (!v.ok) return v
      updates.cuenta_destino = v.data
    }
  }
  if (b.categoria !== undefined) {
    if (b.categoria === null) {
      updates.categoria = null
    } else {
      const v = validateId(b.categoria, 'categoria')
      if (!v.ok) return v
      updates.categoria = v.data
    }
  }
  if (b.subcategoria !== undefined) {
    if (b.subcategoria === null) {
      updates.subcategoria = null
    } else {
      const v = validateId(b.subcategoria, 'subcategoria')
      if (!v.ok) return v
      updates.subcategoria = v.data
    }
  }
  if (b.cotizacion !== undefined) {
    if (b.cotizacion === null) {
      updates.cotizacion = null
    } else {
      const v = validatePositiveNumber(b.cotizacion, { max: 1_000_000, field: 'cotizacion' })
      if (!v.ok) return v
      updates.cotizacion = v.data
    }
  }
  if (b.conciliado !== undefined) {
    const v = validateBoolean(b.conciliado, 'conciliado')
    if (!v.ok) return v
    updates.conciliado = v.data
  }
  if (b.periodo_tarjeta !== undefined) {
    if (b.periodo_tarjeta === null || b.periodo_tarjeta === '') {
      updates.periodo_tarjeta = null
    } else {
      const v = validateISODate(b.periodo_tarjeta, 'periodo_tarjeta')
      if (!v.ok) return v
      updates.periodo_tarjeta = v.data
    }
  }
  if (b.cuotas_total !== undefined) {
    const v = validateInteger(b.cuotas_total, { min: 1, max: CUOTAS_MAX, field: 'cuotas_total' })
    if (!v.ok) return v
    updates.cuotas_total = v.data
  }
  if (b.cuota_actual !== undefined) {
    const v = validateInteger(b.cuota_actual, { min: 1, max: CUOTAS_MAX, field: 'cuota_actual' })
    if (!v.ok) return v
    updates.cuota_actual = v.data
  }
  if (b.ciclo_actual !== undefined) {
    const v = validateInteger(b.ciclo_actual, { min: 1, max: 1000, field: 'ciclo_actual' })
    if (!v.ok) return v
    updates.ciclo_actual = v.data
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
  const aplicarAGrupo = req.nextUrl.searchParams.get('grupo') === 'true'

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateMovimientoUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  if (aplicarAGrupo) {
    // Necesitamos el grupo_cuotas del movimiento actual para encontrar las hermanas
    const { data: actual } = await supabase
      .from('movimientos')
      .select('grupo_cuotas')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!actual?.grupo_cuotas) {
      return NextResponse.json({ error: 'Este movimiento no tiene cuotas linkeadas' }, { status: 400 })
    }

    // Solo permitimos aplicar campos compartibles al grupo
    // (fecha, periodo, detalle, cuota_actual NO se replican)
    const shared: Record<string, unknown> = {}
    for (const [k, value] of Object.entries(v.data)) {
      if (CAMPOS_COMPARTIBLES.has(k)) shared[k] = value
    }
    if (Object.keys(shared).length === 0) {
      return NextResponse.json({ error: 'Ningún campo es aplicable al grupo' }, { status: 400 })
    }

    const { error, count } = await supabase
      .from('movimientos')
      .update(shared, { count: 'exact' })
      .eq('grupo_cuotas', actual.grupo_cuotas)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    revalidatePath('/movimientos')
    return NextResponse.json({ ok: true, afectados: count ?? 0 })
  }

  // PATCH normal: solo este movimiento
  const { error } = await supabase
    .from('movimientos')
    .update(v.data)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/movimientos')
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const eliminarGrupo = req.nextUrl.searchParams.get('grupo') === 'true'

  if (eliminarGrupo) {
    // Eliminar TODAS las cuotas del mismo grupo (incluyendo la actual)
    const { data: actual } = await supabase
      .from('movimientos')
      .select('grupo_cuotas')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!actual?.grupo_cuotas) {
      return NextResponse.json({ error: 'Este movimiento no tiene cuotas linkeadas' }, { status: 400 })
    }

    const { error, count } = await supabase
      .from('movimientos')
      .delete({ count: 'exact' })
      .eq('grupo_cuotas', actual.grupo_cuotas)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    revalidatePath('/movimientos')
    return NextResponse.json({ ok: true, eliminados: count ?? 0 })
  }

  // DELETE normal: solo este movimiento
  const { error } = await supabase
    .from('movimientos')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/movimientos')
  return NextResponse.json({ ok: true })
}
