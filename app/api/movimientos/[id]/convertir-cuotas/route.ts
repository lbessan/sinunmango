// ─── POST /api/movimientos/[id]/convertir-cuotas ─────────────────────────────
//
// Convierte un consumo SUELTO ya cargado en un plan de cuotas. Nace para el
// agujero del canal de Visa: la Alerta de Compras trae el total pero NO las
// cuotas, así que una compra en 12 cuotas entra como un único consumo y editar
// el movimiento no dejaba pasarlo a cuotas.
//
// Toma el movimiento como cuota 1 y crea las cuotas 2..N (una por mes). Es
// atómico en lo posible: inserta las hermanas primero; si después falla el
// update de la original, borra lo insertado (compensación).

import { createClientForRequest } from '@/lib/supabase/route'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { planDeCuotas } from '@/lib/cuotas-convertir'
import { calcularPeriodoCuenta, stripCuotaSuffix } from '@/lib/tarjeta-periodo'
import { validateInteger, validateBoolean } from '@/lib/validators'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const b = (body ?? {}) as Record<string, unknown>

  const nV = validateInteger(b.cuotas_total, { min: 2, max: 60, field: 'cuotas_total' })
  if (!nV.ok) return NextResponse.json({ error: nV.error }, { status: 400 })
  const cuotasTotal = nV.data

  // Default: el monto cargado es el TOTAL (es lo que trae la alerta de Visa).
  let montoEsTotal = true
  if (b.monto_es_total !== undefined) {
    const mt = validateBoolean(b.monto_es_total, 'monto_es_total')
    if (!mt.ok) return NextResponse.json({ error: mt.error }, { status: 400 })
    montoEsTotal = mt.data
  }

  // Movimiento a convertir (del user).
  const { data: mov } = await supabase
    .from('movimientos')
    .select('id, fecha, detalle, monto, moneda, tipo_movimiento, cuenta_origen, cuenta_destino, categoria, subcategoria, cotizacion, conciliado, cuotas_total, grupo_cuotas, gasto_fijo_id')
    .eq('id', id).eq('user_id', user.id).maybeSingle()

  if (!mov) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
  if (mov.grupo_cuotas || (mov.cuotas_total ?? 1) > 1) {
    return NextResponse.json({ error: 'Este movimiento ya es un plan de cuotas' }, { status: 400 })
  }
  if (!mov.fecha) return NextResponse.json({ error: 'El movimiento no tiene fecha' }, { status: 400 })

  // Cuenta: para calcular el período de cada cuota con la regla única.
  let cuenta: { tipo_cuenta?: string | null; fecha_cierre_tarjeta?: string | null; fecha_vencimiento_tarjeta?: string | null } | null = null
  if (mov.cuenta_origen) {
    const { data } = await supabase
      .from('cuentas')
      .select('tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
      .eq('id', mov.cuenta_origen).eq('user_id', user.id).maybeSingle()
    cuenta = data
  }

  const { montoCuota, cuotas } = planDeCuotas({
    montoBase: Number(mov.monto), montoEsTotal, cuotasTotal, fechaBase: mov.fecha,
  })
  const base = stripCuotaSuffix(mov.detalle)
  const grupo = crypto.randomUUID()
  const detalleDe = (i: number) => `${base} (Cuota ${i}/${cuotasTotal})`.trim()

  // Filas hermanas = cuotas 2..N (la 1 es el movimiento que ya existe).
  const hermanas = cuotas.slice(1).map(c => ({
    id:              crypto.randomUUID(),
    fecha:           c.fecha,
    detalle:         detalleDe(c.cuota_actual),
    monto:           montoCuota,
    moneda:          mov.moneda,
    tipo_movimiento: mov.tipo_movimiento,
    cuenta_origen:   mov.cuenta_origen,
    cuenta_destino:  mov.cuenta_destino,
    categoria:       mov.categoria,
    subcategoria:    mov.subcategoria,
    cotizacion:      mov.cotizacion,
    conciliado:      false,   // las cuotas futuras todavía no están en un resumen
    periodo_tarjeta: calcularPeriodoCuenta(c.fecha, cuenta),
    cuotas_total:    cuotasTotal,
    cuota_actual:    c.cuota_actual,
    ciclo_actual:    1,
    grupo_cuotas:    grupo,
    gasto_fijo_id:   mov.gasto_fijo_id ?? null,
    user_id:         user.id,
  }))

  const { error: errIns } = await supabase.from('movimientos').insert(hermanas as never)
  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 400 })

  // Convertir la original en cuota 1/N.
  const { error: errUpd } = await supabase
    .from('movimientos')
    .update({
      monto:           montoCuota,
      detalle:         detalleDe(1),
      cuotas_total:    cuotasTotal,
      cuota_actual:    1,
      grupo_cuotas:    grupo,
      periodo_tarjeta: calcularPeriodoCuenta(mov.fecha, cuenta),
    } as never)
    .eq('id', id).eq('user_id', user.id)

  if (errUpd) {
    // Compensación: sacamos las hermanas que ya insertamos para no dejar
    // un grupo a medias.
    await supabase.from('movimientos').delete().eq('grupo_cuotas', grupo).eq('user_id', user.id).neq('id', id)
    return NextResponse.json({ error: errUpd.message }, { status: 400 })
  }

  revalidatePath('/movimientos')
  return NextResponse.json({ ok: true, cuotas: cuotasTotal, monto_cuota: montoCuota })
}
