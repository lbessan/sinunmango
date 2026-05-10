import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validateFiniteNumber, validateBoolean,
  validateHexColor, validateISODate,
  isString, TERMINACION_4,
  type Validated,
} from '@/lib/validators'

const TIPOS_CUENTA = ['Banco CA', 'Banco CC', 'Billetera', 'Efectivo', 'Tarjeta Credito'] as const
const MONEDAS      = ['ARS', 'USD'] as const

// PATCH valida solo los campos presentes — null/undefined/'' significa "no tocar".
// Si un campo viene con valor, debe pasar la misma validación que en POST.
function validateCuentaUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre_cuenta !== undefined) {
    const v = validateString(b.nombre_cuenta, { max: 100, field: 'nombre_cuenta' })
    if (!v.ok) return v
    updates.nombre_cuenta = v.data
  }

  if (b.institucion !== undefined && b.institucion !== null) {
    const v = validateString(b.institucion, { min: 0, max: 100, field: 'institucion' })
    if (!v.ok) return v
    updates.institucion = v.data || null
  } else if (b.institucion === null) {
    updates.institucion = null
  }

  if (b.moneda !== undefined) {
    const v = validateEnum(b.moneda, MONEDAS, 'moneda')
    if (!v.ok) return v
    updates.moneda = v.data
  }

  if (b.tipo_cuenta !== undefined) {
    const v = validateEnum(b.tipo_cuenta, TIPOS_CUENTA, 'tipo_cuenta')
    if (!v.ok) return v
    updates.tipo_cuenta = v.data
  }

  if (b.saldo_inicial !== undefined) {
    const v = validateFiniteNumber(b.saldo_inicial, { field: 'saldo_inicial' })
    if (!v.ok) return v
    updates.saldo_inicial = v.data
  }

  if (b.activa !== undefined) {
    const v = validateBoolean(b.activa, 'activa')
    if (!v.ok) return v
    updates.activa = v.data
  }

  if (b.color_primario !== undefined) {
    const v = validateHexColor(b.color_primario, 'color_primario')
    if (!v.ok) return v
    updates.color_primario = v.data
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

  if (b.terminacion_tarjeta !== undefined) {
    if (b.terminacion_tarjeta === null || b.terminacion_tarjeta === '') {
      updates.terminacion_tarjeta = null
    } else {
      if (!isString(b.terminacion_tarjeta) || !TERMINACION_4.test(b.terminacion_tarjeta)) {
        return { ok: false, error: 'terminacion_tarjeta debe ser exactamente 4 dígitos' }
      }
      updates.terminacion_tarjeta = b.terminacion_tarjeta
    }
  }

  if (b.fecha_cierre_tarjeta !== undefined) {
    if (b.fecha_cierre_tarjeta === null || b.fecha_cierre_tarjeta === '') {
      updates.fecha_cierre_tarjeta = null
    } else {
      const v = validateISODate(b.fecha_cierre_tarjeta, 'fecha_cierre_tarjeta')
      if (!v.ok) return v
      updates.fecha_cierre_tarjeta = v.data
    }
  }

  if (b.fecha_vencimiento_tarjeta !== undefined) {
    if (b.fecha_vencimiento_tarjeta === null || b.fecha_vencimiento_tarjeta === '') {
      updates.fecha_vencimiento_tarjeta = null
    } else {
      const v = validateISODate(b.fecha_vencimiento_tarjeta, 'fecha_vencimiento_tarjeta')
      if (!v.ok) return v
      updates.fecha_vencimiento_tarjeta = v.data
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

  const v = validateCuentaUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('cuentas')
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

  // Soft-delete: desactivar la cuenta en lugar de eliminarla,
  // para preservar el historial de movimientos
  const { error } = await supabase
    .from('cuentas')
    .update({ activa: false })
    .eq('id', id)
    .eq('user_id', user.id)
    .neq('tipo_cuenta', 'Tarjeta Credito') // las tarjetas tienen su propio endpoint

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
