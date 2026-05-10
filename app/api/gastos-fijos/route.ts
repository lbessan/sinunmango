import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateInteger,
  validateBoolean, validateId, optional,
  type Validated,
} from '@/lib/validators'

const MONEDAS = ['ARS', 'USD'] as const

type GastoFijoInsert = {
  nombre_gasto:        string
  monto_estimado:      number
  moneda:              'ARS' | 'USD'
  dia_vencimiento:     number | null
  cuenta_pago_default: string | null
  id_categoria:        string | null
  id_subcategoria:     string | null
  activo:              boolean
}

function validateGastoFijo(raw: unknown): Validated<GastoFijoInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const nombre = validateString(b.nombre_gasto, { max: 100, field: 'nombre_gasto' })
  if (!nombre.ok) return nombre

  const monto = validatePositiveNumber(b.monto_estimado, { max: 1_000_000_000, field: 'monto_estimado' })
  if (!monto.ok) return monto

  const moneda = validateEnum(b.moneda, MONEDAS, 'moneda')
  if (!moneda.ok) return moneda

  // dia_vencimiento opcional, integer 1-31 si viene
  const diaOpt = optional(b.dia_vencimiento, v => validateInteger(v, { min: 1, max: 31, field: 'dia_vencimiento' }))
  if (!diaOpt.ok) return diaOpt

  const cuentaOpt = optional(b.cuenta_pago_default, v => validateId(v, 'cuenta_pago_default'))
  if (!cuentaOpt.ok) return cuentaOpt

  const catOpt = optional(b.id_categoria, v => validateId(v, 'id_categoria'))
  if (!catOpt.ok) return catOpt

  const subcatOpt = optional(b.id_subcategoria, v => validateId(v, 'id_subcategoria'))
  if (!subcatOpt.ok) return subcatOpt

  const activoOpt = optional(b.activo, v => validateBoolean(v, 'activo'))
  if (!activoOpt.ok) return activoOpt

  return {
    ok: true,
    data: {
      nombre_gasto:        nombre.data,
      monto_estimado:      monto.data,
      moneda:              moneda.data,
      dia_vencimiento:     diaOpt.data,
      cuenta_pago_default: cuentaOpt.data,
      id_categoria:        catOpt.data,
      id_subcategoria:     subcatOpt.data,
      activo:              activoOpt.data ?? true,
    },
  }
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateGastoFijo(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const id = 'fijo_' + Date.now().toString(36)
  const { error } = await supabase.from('gastos_fijos').insert({ id, ...v.data, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
