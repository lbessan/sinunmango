import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// ─── POST /api/asistente-accion ───────────────────────────────────────────────
// Executes an action parsed from the AI assistant's response.
// Currently supports: nuevo_movimiento

type AccionMovimiento = {
  tipo:          'nuevo_movimiento'
  detalle:       string
  monto:         number
  moneda:        'ARS' | 'USD'
  cuotas:        number
  cuenta_id:     string
  categoria_id:  string
  fecha:         string
}

function calcularPeriodo(fecha: string, cierre: number | null, vence: number | null, esTarjeta: boolean): string {
  const d    = new Date(fecha + 'T12:00:00')
  let mes    = d.getMonth()
  let anio   = d.getFullYear()
  if (esTarjeta && cierre && vence) {
    const day = d.getDate()
    if (day <= cierre) {
      if (vence <= cierre) mes++
    } else {
      if (vence > cierre) mes++
      else mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function addMonths(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00')
  dt.setMonth(dt.getMonth() + n)
  return dt.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accion = (await req.json()) as AccionMovimiento

  if (accion.tipo !== 'nuevo_movimiento') {
    return NextResponse.json({ error: 'Tipo de acción no soportado.' }, { status: 400 })
  }

  // Validate cuenta belongs to user
  const { data: cuenta } = await adminClient
    .from('cuentas')
    .select('id, tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta, nombre_cuenta')
    .eq('id', accion.cuenta_id)
    .eq('user_id', user.id)
    .single()

  if (!cuenta) {
    return NextResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 })
  }

  const isTarjeta = cuenta.tipo_cuenta === 'Tarjeta Credito'
  const cierre    = cuenta.fecha_cierre_tarjeta    ? new Date(cuenta.fecha_cierre_tarjeta    + 'T12:00:00').getDate() : null
  const vence     = cuenta.fecha_vencimiento_tarjeta ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
  const cuotas    = accion.cuotas ?? 1
  const montoCuota = accion.monto / cuotas

  const records = Array.from({ length: cuotas }, (_, i) => {
    const fechaCuota = addMonths(accion.fecha, i)
    return {
      id:              crypto.randomUUID(),
      fecha:           fechaCuota,
      detalle:         cuotas > 1 ? `${accion.detalle} (Cuota ${i + 1}/${cuotas})` : accion.detalle,
      monto:           montoCuota,
      moneda:          accion.moneda,
      tipo_movimiento: 'Gasto',
      cuenta_origen:   accion.cuenta_id,
      cuenta_destino:  null,
      categoria:       accion.categoria_id,
      subcategoria:    null,
      cotizacion:      null,
      conciliado:      false,
      periodo_tarjeta: calcularPeriodo(fechaCuota, cierre, vence, isTarjeta && accion.moneda !== 'USD'),
      cuotas_total:    cuotas,
      cuota_actual:    i + 1,
      ciclo_actual:    1,
      user_id:         user.id,
    }
  })

  const { error } = await adminClient.from('movimientos').insert(records)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:     true,
    cuenta: cuenta.nombre_cuenta,
    cuotas,
    monto:  accion.monto,
  })
}
