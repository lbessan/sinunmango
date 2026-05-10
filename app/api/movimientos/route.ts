import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateFiniteNumber,
  validateBoolean, validateInteger, validateISODate, validateId, optional,
  type Validated,
} from '@/lib/validators'

const MONEDAS         = ['ARS', 'USD'] as const
const TIPOS_MOV       = ['Gasto', 'Ingreso', 'Transferencia'] as const
const MONTO_MAX       = 1_000_000_000   // 1.000.000.000 ARS — defensa contra typos / overflow
const CUOTAS_MAX      = 60               // 5 años de cuotas mensuales
const DETALLE_MAX     = 500

type MovimientoInsert = {
  fecha:           string
  detalle:         string | null
  monto:           number
  moneda:          'ARS' | 'USD'
  tipo_movimiento: 'Gasto' | 'Ingreso' | 'Transferencia'
  cuenta_origen:   string | null
  cuenta_destino:  string | null
  categoria:       string | null
  subcategoria:    string | null
  cotizacion:      number | null
  conciliado:      boolean
  periodo_tarjeta: string | null
  cuotas_total:    number
  cuota_actual:    number
  ciclo_actual:    number
}

function validateMovimiento(raw: unknown): Validated<MovimientoInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Movimiento inválido' }
  const b = raw as Record<string, unknown>

  const fecha = validateISODate(b.fecha, 'fecha')
  if (!fecha.ok) return fecha

  const monto = validatePositiveNumber(b.monto, { max: MONTO_MAX, field: 'monto' })
  if (!monto.ok) return monto

  const moneda = validateEnum(b.moneda, MONEDAS, 'moneda')
  if (!moneda.ok) return moneda

  const tipo = validateEnum(b.tipo_movimiento, TIPOS_MOV, 'tipo_movimiento')
  if (!tipo.ok) return tipo

  const detalleOpt = optional(b.detalle, v => validateString(v, { max: DETALLE_MAX, field: 'detalle' }))
  if (!detalleOpt.ok) return detalleOpt

  const origenOpt = optional(b.cuenta_origen, v => validateId(v, 'cuenta_origen'))
  if (!origenOpt.ok) return origenOpt

  const destinoOpt = optional(b.cuenta_destino, v => validateId(v, 'cuenta_destino'))
  if (!destinoOpt.ok) return destinoOpt

  // Transferencia requiere ambas cuentas
  if (tipo.data === 'Transferencia' && (!origenOpt.data || !destinoOpt.data)) {
    return { ok: false, error: 'Transferencia requiere cuenta_origen y cuenta_destino' }
  }
  // Gasto/Ingreso requieren al menos cuenta_origen
  if ((tipo.data === 'Gasto' || tipo.data === 'Ingreso') && !origenOpt.data) {
    return { ok: false, error: `${tipo.data} requiere cuenta_origen` }
  }

  const categoriaOpt = optional(b.categoria, v => validateId(v, 'categoria'))
  if (!categoriaOpt.ok) return categoriaOpt
  const subcategoriaOpt = optional(b.subcategoria, v => validateId(v, 'subcategoria'))
  if (!subcategoriaOpt.ok) return subcategoriaOpt

  const cotizOpt = optional(b.cotizacion, v => validatePositiveNumber(v, { max: 1_000_000, field: 'cotizacion' }))
  if (!cotizOpt.ok) return cotizOpt

  const concOpt = optional(b.conciliado, v => validateBoolean(v, 'conciliado'))
  if (!concOpt.ok) return concOpt

  const periodoOpt = optional(b.periodo_tarjeta, v => validateISODate(v, 'periodo_tarjeta'))
  if (!periodoOpt.ok) return periodoOpt

  const cuotasTotalOpt = optional(b.cuotas_total, v => validateInteger(v, { min: 1, max: CUOTAS_MAX, field: 'cuotas_total' }))
  if (!cuotasTotalOpt.ok) return cuotasTotalOpt

  const cuotaActualOpt = optional(b.cuota_actual, v => validateInteger(v, { min: 1, max: CUOTAS_MAX, field: 'cuota_actual' }))
  if (!cuotaActualOpt.ok) return cuotaActualOpt

  const cicloOpt = optional(b.ciclo_actual, v => validateInteger(v, { min: 1, max: 1000, field: 'ciclo_actual' }))
  if (!cicloOpt.ok) return cicloOpt

  return {
    ok: true,
    data: {
      fecha:           fecha.data,
      detalle:         detalleOpt.data,
      monto:           monto.data,
      moneda:          moneda.data,
      tipo_movimiento: tipo.data,
      cuenta_origen:   origenOpt.data,
      cuenta_destino:  destinoOpt.data,
      categoria:       categoriaOpt.data,
      subcategoria:    subcategoriaOpt.data,
      cotizacion:      cotizOpt.data,
      conciliado:      concOpt.data ?? false,
      periodo_tarjeta: periodoOpt.data,
      cuotas_total:    cuotasTotalOpt.data ?? 1,
      cuota_actual:    cuotaActualOpt.data ?? 1,
      ciclo_actual:    cicloOpt.data ?? 1,
    },
  }
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  // Soporta tanto un único record como un array (cuotas, multi-insert)
  const records = Array.isArray(body) ? body : [body]
  if (records.length === 0) return NextResponse.json({ error: 'Sin registros' }, { status: 400 })
  if (records.length > 100) return NextResponse.json({ error: 'Demasiados registros (máx 100)' }, { status: 400 })

  const validated: MovimientoInsert[] = []
  for (let i = 0; i < records.length; i++) {
    const v = validateMovimiento(records[i])
    if (!v.ok) return NextResponse.json({ error: `Registro ${i}: ${v.error}` }, { status: 400 })
    validated.push(v.data)
  }

  // user_id se setea desde el server, NUNCA del body. El id se genera si no viene.
  const withUser = validated.map(r => ({ id: crypto.randomUUID(), ...r, user_id: user.id }))

  const { error } = await supabase.from('movimientos').insert(withUser)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
