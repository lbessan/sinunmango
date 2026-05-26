import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validateBoolean, validateHexColor,
  validateISODate, validateId, optional,
  isString, TERMINACION_4,
  type Validated,
} from '@/lib/validators'

const MONEDAS = ['ARS', 'USD'] as const
const NOMBRE_TITULAR_MAX = 100

type TarjetaInsert = {
  nombre_cuenta:             string
  institucion:               string | null
  moneda:                    'ARS' | 'USD'
  imagen_url:                string | null
  imagen_banner_url:         string | null
  color_primario:            string
  terminacion_tarjeta:       string | null
  fecha_cierre_tarjeta:      string | null
  fecha_vencimiento_tarjeta: string | null
  activa:                    boolean
  tarjeta_principal_id:      string | null
  nombre_titular:            string | null
}

function validateTarjeta(raw: unknown): Validated<TarjetaInsert> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const nombre = validateString(b.nombre_cuenta ?? b.nombre, { max: 100, field: 'nombre_cuenta' })
  if (!nombre.ok) return nombre

  const moneda = validateEnum(b.moneda, MONEDAS, 'moneda')
  if (!moneda.ok) return moneda

  const institucionOpt = optional(b.institucion, v => validateString(v, { max: 100, field: 'institucion' }))
  if (!institucionOpt.ok) return institucionOpt

  const imgOpt = optional(b.imagen_url, v => validateString(v, { max: 500, field: 'imagen_url' }))
  if (!imgOpt.ok) return imgOpt
  const bannerOpt = optional(b.imagen_banner_url, v => validateString(v, { max: 500, field: 'imagen_banner_url' }))
  if (!bannerOpt.ok) return bannerOpt

  const colorOpt = optional(b.color_primario, v => validateHexColor(v, 'color_primario'))
  if (!colorOpt.ok) return colorOpt

  // Terminación: 4 dígitos exactos
  let terminacion: string | null = null
  if (b.terminacion_tarjeta !== undefined && b.terminacion_tarjeta !== null && b.terminacion_tarjeta !== '') {
    if (!isString(b.terminacion_tarjeta) || !TERMINACION_4.test(b.terminacion_tarjeta)) {
      return { ok: false, error: 'terminacion_tarjeta debe ser exactamente 4 dígitos' }
    }
    terminacion = b.terminacion_tarjeta
  }

  const cierreOpt = optional(b.fecha_cierre_tarjeta, v => validateISODate(v, 'fecha_cierre_tarjeta'))
  if (!cierreOpt.ok) return cierreOpt
  const venceOpt = optional(b.fecha_vencimiento_tarjeta, v => validateISODate(v, 'fecha_vencimiento_tarjeta'))
  if (!venceOpt.ok) return venceOpt

  const activaOpt = optional(b.activa, v => validateBoolean(v, 'activa'))
  if (!activaOpt.ok) return activaOpt

  // tarjeta_principal_id: si viene, esta es una ADICIONAL. Acepta string
  // o null/''. Validamos formato del id en la siguiente etapa, dado que
  // necesitamos chequear contra la DB (ownership + es Tarjeta Credito +
  // no es adicional a su vez). Eso se hace en el endpoint, no acá.
  let tarjetaPrincipalId: string | null = null
  if (b.tarjeta_principal_id !== undefined && b.tarjeta_principal_id !== null && b.tarjeta_principal_id !== '') {
    const v = validateId(b.tarjeta_principal_id, 'tarjeta_principal_id')
    if (!v.ok) return v
    tarjetaPrincipalId = v.data
  }

  // nombre_titular: lo que aparece en el PDF (ej: "Celeste Cerono").
  // Opcional. Se usa para matching al procesar el resumen.
  let nombreTitular: string | null = null
  if (b.nombre_titular !== undefined && b.nombre_titular !== null && b.nombre_titular !== '') {
    const v = validateString(b.nombre_titular, { max: NOMBRE_TITULAR_MAX, field: 'nombre_titular' })
    if (!v.ok) return v
    nombreTitular = v.data
  }

  return {
    ok: true,
    data: {
      nombre_cuenta:             nombre.data,
      institucion:               institucionOpt.data,
      moneda:                    moneda.data,
      imagen_url:                imgOpt.data,
      imagen_banner_url:         bannerOpt.data,
      color_primario:            colorOpt.data ?? '#1e293b',
      terminacion_tarjeta:       terminacion,
      fecha_cierre_tarjeta:      cierreOpt.data,
      fecha_vencimiento_tarjeta: venceOpt.data,
      activa:                    activaOpt.data ?? true,
      tarjeta_principal_id:      tarjetaPrincipalId,
      nombre_titular:            nombreTitular,
    },
  }
}

// Valida que `principalId` apunte a una cuenta del user que sea
// Tarjeta Credito y NO sea ella misma una adicional (depth=1).
// Si el row no existe, no es del user, no es tarjeta o ya es adicional
// → devuelve mensaje de error.
async function assertPrincipalValida(
  supabase: ReturnType<typeof createClientForRequest> extends Promise<infer T> ? (T extends { supabase: infer S } ? S : never) : never,
  principalId: string,
  userId: string,
): Promise<{ ok: true; principal: { moneda: string; fecha_cierre_tarjeta: string | null; fecha_vencimiento_tarjeta: string | null } } | { ok: false; error: string }> {
  const { data } = await supabase
    .from('cuentas')
    .select('id, tipo_cuenta, tarjeta_principal_id, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
    .eq('id', principalId)
    .eq('user_id', userId)
    .maybeSingle()
  const row = data as unknown as {
    tipo_cuenta?: string | null
    tarjeta_principal_id?: string | null
    moneda?: string | null
    fecha_cierre_tarjeta?: string | null
    fecha_vencimiento_tarjeta?: string | null
  } | null
  if (!row) return { ok: false, error: 'La tarjeta principal no existe o no es tuya' }
  if (row.tipo_cuenta !== 'Tarjeta Credito') return { ok: false, error: 'La principal debe ser una Tarjeta Credito' }
  if (row.tarjeta_principal_id) return { ok: false, error: 'No podés crear una adicional de otra adicional' }
  return {
    ok: true,
    principal: {
      moneda:                    row.moneda ?? 'ARS',
      fecha_cierre_tarjeta:      row.fecha_cierre_tarjeta ?? null,
      fecha_vencimiento_tarjeta: row.fecha_vencimiento_tarjeta ?? null,
    },
  }
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)
    .order('nombre_cuenta')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateTarjeta(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Si es una adicional, validar la principal y heredar campos.
  let finalData = { ...v.data }
  if (v.data.tarjeta_principal_id) {
    const check = await assertPrincipalValida(supabase, v.data.tarjeta_principal_id, user.id)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    // Heredamos moneda + fechas. La password no se guarda en la adicional —
    // al usarla, /api/parsear-resumen busca la cipher en la principal.
    finalData = {
      ...finalData,
      moneda:                    (check.principal.moneda as 'ARS' | 'USD'),
      fecha_cierre_tarjeta:      check.principal.fecha_cierre_tarjeta,
      fecha_vencimiento_tarjeta: check.principal.fecha_vencimiento_tarjeta,
    }
  }

  // tipo_cuenta forzado a 'Tarjeta Credito' por este endpoint (no del body)
  const id = crypto.randomUUID()
  const { error } = await supabase.from('cuentas').insert({
    id,
    ...finalData,
    tipo_cuenta: 'Tarjeta Credito',
    user_id:     user.id,
  } as never)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
