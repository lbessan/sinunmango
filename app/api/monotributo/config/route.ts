import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateISODate,
  validateId, optional, isPlainObject,
  type Validated,
} from '@/lib/validators'

const ACTIVIDADES = ['servicios', 'venta_bienes'] as const

type ConfigUpsert = {
  categoria:                string
  actividad:                'servicios' | 'venta_bienes'
  limite_facturacion_anual: number
  costo_mensual:            number
  vigente_desde:            string
  gasto_fijo_id:            string | null
  notas:                    string | null
}

function validateConfig(raw: unknown): Validated<ConfigUpsert> {
  if (!isPlainObject(raw)) return { ok: false, error: 'Body inválido' }

  const categoria = validateString(raw.categoria, { min: 1, max: 4, field: 'categoría' })
  if (!categoria.ok) return categoria

  const actividad = validateEnum(raw.actividad, ACTIVIDADES, 'actividad')
  if (!actividad.ok) return actividad

  const limite = validatePositiveNumber(raw.limite_facturacion_anual, {
    max: 100_000_000_000, field: 'límite anual',
  })
  if (!limite.ok) return limite

  const costo = validatePositiveNumber(raw.costo_mensual, {
    allowZero: true, max: 100_000_000, field: 'costo mensual',
  })
  if (!costo.ok) return costo

  const vigente = validateISODate(raw.vigente_desde, 'vigente_desde')
  if (!vigente.ok) return vigente

  const gastoFijoRes = optional(raw.gasto_fijo_id, v => validateId(v, 'gasto_fijo_id'))
  if (!gastoFijoRes.ok) return gastoFijoRes

  const notasRes = optional(raw.notas, v => validateString(v, { min: 1, max: 500, field: 'notas' }))
  if (!notasRes.ok) return notasRes

  return {
    ok: true,
    data: {
      categoria:                categoria.data,
      actividad:                actividad.data,
      limite_facturacion_anual: limite.data,
      costo_mensual:            costo.data,
      vigente_desde:            vigente.data,
      gasto_fijo_id:            gastoFijoRes.data ?? null,
      notas:                    notasRes.data ?? null,
    },
  }
}

// ─── GET /api/monotributo/config ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('monotributo_config')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// ─── PUT /api/monotributo/config ─────────────────────────────────────────────
// Upsert por (user_id) — crea si no existe, actualiza si existe.
export async function PUT(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateConfig(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('monotributo_config')
    .upsert({ user_id: user.id, ...v.data }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
