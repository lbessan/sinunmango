import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validateFiniteNumber, validateBoolean,
  validateHexColor, validateISODate, optional,
  isString, TERMINACION_4,
  type Validated,
} from '@/lib/validators'

const TIPOS_CUENTA = ['Banco CA', 'Banco CC', 'Billetera', 'Efectivo', 'Tarjeta Credito'] as const
const MONEDAS      = ['ARS', 'USD'] as const

type CuentaInsert = {
  nombre_cuenta:             string
  institucion:               string | null
  moneda:                    'ARS' | 'USD'
  tipo_cuenta:               typeof TIPOS_CUENTA[number]
  saldo_inicial:             number
  activa:                    boolean
  imagen_url:                string | null
  imagen_banner_url:         string | null
  color_primario:            string
  terminacion_tarjeta:       string | null
  fecha_cierre_tarjeta:      string | null
  fecha_vencimiento_tarjeta: string | null
}

function validateCuenta(raw: unknown): Validated<CuentaInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const nombre   = validateString(b.nombre_cuenta, { max: 100, field: 'nombre_cuenta' })
  if (!nombre.ok) return nombre
  const moneda   = validateEnum(b.moneda, MONEDAS, 'moneda')
  if (!moneda.ok) return moneda
  const tipo     = validateEnum(b.tipo_cuenta, TIPOS_CUENTA, 'tipo_cuenta')
  if (!tipo.ok) return tipo

  const saldoOpt = optional(b.saldo_inicial, v => validateFiniteNumber(v, { field: 'saldo_inicial' }))
  if (!saldoOpt.ok) return saldoOpt

  const activaOpt = optional(b.activa, v => validateBoolean(v, 'activa'))
  if (!activaOpt.ok) return activaOpt

  const colorOpt = optional(b.color_primario, v => validateHexColor(v, 'color_primario'))
  if (!colorOpt.ok) return colorOpt

  const institucionOpt = optional(b.institucion, v => validateString(v, { max: 100, field: 'institucion' }))
  if (!institucionOpt.ok) return institucionOpt

  // URLs de imágenes — validamos que sean strings razonables (max 500), no URL parsing estricto
  const imgOpt = optional(b.imagen_url, v => validateString(v, { max: 500, field: 'imagen_url' }))
  if (!imgOpt.ok) return imgOpt
  const bannerOpt = optional(b.imagen_banner_url, v => validateString(v, { max: 500, field: 'imagen_banner_url' }))
  if (!bannerOpt.ok) return bannerOpt

  // Terminación: si viene, exactamente 4 dígitos
  let terminacion: string | null = null
  if (b.terminacion_tarjeta !== undefined && b.terminacion_tarjeta !== null && b.terminacion_tarjeta !== '') {
    if (!isString(b.terminacion_tarjeta) || !TERMINACION_4.test(b.terminacion_tarjeta)) {
      return { ok: false, error: 'terminacion_tarjeta debe ser exactamente 4 dígitos' }
    }
    terminacion = b.terminacion_tarjeta
  }

  // Fechas de tarjeta — opcionales
  const cierreOpt = optional(b.fecha_cierre_tarjeta, v => validateISODate(v, 'fecha_cierre_tarjeta'))
  if (!cierreOpt.ok) return cierreOpt
  const venceOpt = optional(b.fecha_vencimiento_tarjeta, v => validateISODate(v, 'fecha_vencimiento_tarjeta'))
  if (!venceOpt.ok) return venceOpt

  return {
    ok: true,
    data: {
      nombre_cuenta:             nombre.data,
      institucion:               institucionOpt.data,
      moneda:                    moneda.data,
      tipo_cuenta:               tipo.data,
      saldo_inicial:             saldoOpt.data ?? 0,
      activa:                    activaOpt.data ?? true,
      imagen_url:                imgOpt.data,
      imagen_banner_url:         bannerOpt.data,
      color_primario:            colorOpt.data ?? '#0d3b6e',
      terminacion_tarjeta:       terminacion,
      fecha_cierre_tarjeta:      cierreOpt.data,
      fecha_vencimiento_tarjeta: venceOpt.data,
    },
  }
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateCuenta(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const id = crypto.randomUUID()
  const { error } = await supabase.from('cuentas').insert({ id, ...v.data, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
