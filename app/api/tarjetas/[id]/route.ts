import { createClientForRequest } from '@/lib/supabase/route'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validateBoolean, validateHexColor,
  validateISODate, validateId,
  isString, TERMINACION_4,
  type Validated,
} from '@/lib/validators'
import { encryptSecret } from '@/lib/crypto'

// Límite de password del resumen — DNIs argentinos son ~8 dígitos pero
// algunos bancos usan combinaciones (DNI + algo). 100 chars es generoso
// y evita abuso por payloads gigantes.
const RESUMEN_PASSWORD_MAX = 100
const NOMBRE_TITULAR_MAX   = 100

const MONEDAS = ['ARS', 'USD'] as const

function validateTarjetaUpdate(raw: unknown): Validated<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (b.nombre_cuenta !== undefined) {
    const v = validateString(b.nombre_cuenta, { max: 100, field: 'nombre_cuenta' })
    if (!v.ok) return v
    updates.nombre_cuenta = v.data
  }
  if (b.institucion !== undefined) {
    if (b.institucion === null || b.institucion === '') {
      updates.institucion = null
    } else {
      const v = validateString(b.institucion, { max: 100, field: 'institucion' })
      if (!v.ok) return v
      updates.institucion = v.data
    }
  }
  if (b.moneda !== undefined) {
    const v = validateEnum(b.moneda, MONEDAS, 'moneda')
    if (!v.ok) return v
    updates.moneda = v.data
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
  // Fechas "pendientes" del próximo ciclo (las setea avanzar-ciclo; acá solo
  // permitimos limpiarlas a null — usado por el "deshacer" de la conciliación).
  if (b.fecha_cierre_pendiente !== undefined) {
    if (b.fecha_cierre_pendiente === null || b.fecha_cierre_pendiente === '') {
      updates.fecha_cierre_pendiente = null
    } else {
      const v = validateISODate(b.fecha_cierre_pendiente, 'fecha_cierre_pendiente')
      if (!v.ok) return v
      updates.fecha_cierre_pendiente = v.data
    }
  }
  if (b.fecha_vencimiento_pendiente !== undefined) {
    if (b.fecha_vencimiento_pendiente === null || b.fecha_vencimiento_pendiente === '') {
      updates.fecha_vencimiento_pendiente = null
    } else {
      const v = validateISODate(b.fecha_vencimiento_pendiente, 'fecha_vencimiento_pendiente')
      if (!v.ok) return v
      updates.fecha_vencimiento_pendiente = v.data
    }
  }
  if (b.activa !== undefined) {
    const v = validateBoolean(b.activa, 'activa')
    if (!v.ok) return v
    updates.activa = v.data
  }
  // tarjeta_principal_id: si cambia, validamos contra la DB (ownership +
  // depth=1 + es Tarjeta Credito). Si viene null/'' → setear null (la
  // adicional pasa a ser principal, hay que decidir qué pasa con campos
  // heredados — pero el endpoint sigue siendo idempotente). Nota: este
  // PATCH NO hereda fechas/moneda automáticamente al cambiar a adicional,
  // el client debería pasar también esos cambios si quiere consistencia.
  if (b.tarjeta_principal_id !== undefined) {
    if (b.tarjeta_principal_id === null || b.tarjeta_principal_id === '') {
      updates.tarjeta_principal_id = null
    } else {
      const v = validateId(b.tarjeta_principal_id, 'tarjeta_principal_id')
      if (!v.ok) return v
      updates.tarjeta_principal_id = v.data
    }
  }
  // nombre_titular: lo que aparece en el PDF del resumen. Opcional.
  if (b.nombre_titular !== undefined) {
    if (b.nombre_titular === null || b.nombre_titular === '') {
      updates.nombre_titular = null
    } else {
      const v = validateString(b.nombre_titular, { max: NOMBRE_TITULAR_MAX, field: 'nombre_titular' })
      if (!v.ok) return v
      updates.nombre_titular = v.data
    }
  }
  // resumen_password: plaintext del cliente. Lo encriptamos antes de guardar
  // en resumen_password_cipher. Si viene null o string vacío → borrar
  // (setear cipher a null). Nunca devolvemos plaintext en respuestas.
  if (b.resumen_password !== undefined) {
    if (b.resumen_password === null || b.resumen_password === '') {
      updates.resumen_password_cipher = null
    } else {
      const v = validateString(b.resumen_password, { max: RESUMEN_PASSWORD_MAX, field: 'resumen_password' })
      if (!v.ok) return v
      try {
        updates.resumen_password_cipher = encryptSecret(v.data)
      } catch (err) {
        console.error('[tarjetas/PATCH] encryptSecret error:', err)
        return { ok: false, error: 'No pudimos guardar la password (server mal configurado)' }
      }
    }
  }
  // Importante: tipo_cuenta NUNCA se permite cambiar desde aquí
  // (este endpoint es solo para tarjetas)

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

  const v = validateTarjetaUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (Object.keys(v.data).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  // Si se está cambiando tarjeta_principal_id a un valor no-null, validar
  // contra la DB: que la principal exista, sea del user, sea Tarjeta
  // Credito, NO sea ella misma una adicional, y no sea la misma cuenta
  // (no podés ser tu propia principal — autorreferencia).
  if (v.data.tarjeta_principal_id !== undefined && v.data.tarjeta_principal_id !== null) {
    const principalId = v.data.tarjeta_principal_id as string
    if (principalId === id) {
      return NextResponse.json({ error: 'Una tarjeta no puede ser principal de sí misma' }, { status: 400 })
    }
    const { data: row } = await supabase
      .from('cuentas')
      .select('id, tipo_cuenta, tarjeta_principal_id')
      .eq('id', principalId)
      .eq('user_id', user.id)
      .maybeSingle()
    const p = row as unknown as { tipo_cuenta?: string; tarjeta_principal_id?: string | null } | null
    if (!p) return NextResponse.json({ error: 'La tarjeta principal no existe o no es tuya' }, { status: 400 })
    if (p.tipo_cuenta !== 'Tarjeta Credito') return NextResponse.json({ error: 'La principal debe ser Tarjeta Credito' }, { status: 400 })
    if (p.tarjeta_principal_id) return NextResponse.json({ error: 'No podés ser adicional de otra adicional' }, { status: 400 })
  }

  const { error } = await supabase
    .from('cuentas')
    .update(v.data as never)
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/tarjetas')
  revalidatePath('/dashboard')
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
    .from('cuentas')
    .update({ activa: false })
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/tarjetas')
  revalidatePath('/dashboard')
  return NextResponse.json({ ok: true })
}
