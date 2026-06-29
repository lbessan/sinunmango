import { createClientForRequest } from '@/lib/supabase/route'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { calcularPeriodoCuenta } from '@/lib/tarjeta-periodo'

// ─── POST /api/tarjetas/[id]/recalcular-periodos ─────────────────────────────
// Recalcula periodo_tarjeta de las compras NO conciliadas de la tarjeta usando
// las fechas de cierre/vencimiento ACTUALES. Sirve para reordenar compras que
// quedaron mal asignadas (ej. por haber avanzado las fechas antes de tiempo).
//
// Solo toca NO conciliadas: las conciliadas pertenecen a ciclos ya cerrados y
// no deben moverse. Cada movimiento se recalcula con su propia fecha (para
// cuotas, la fecha de esa cuota).
//
// Resp: { ok, total, actualizadas }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  // Tarjeta + sus fechas actuales
  const { data: tarjeta, error: errSel } = await supabase
    .from('cuentas')
    .select('id, tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)
    .maybeSingle()

  if (errSel)   return NextResponse.json({ error: errSel.message }, { status: 400 })
  if (!tarjeta) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 })

  const cuenta = tarjeta as {
    tipo_cuenta: string
    fecha_cierre_tarjeta: string | null
    fecha_vencimiento_tarjeta: string | null
  }

  // Compras no conciliadas de la tarjeta
  const { data: movsRaw, error: errMovs } = await supabase
    .from('movimientos')
    .select('id, fecha, periodo_tarjeta')
    .eq('cuenta_origen', id)
    .eq('tipo_movimiento', 'Gasto')
    .eq('conciliado', false)
    .eq('user_id', user.id)

  if (errMovs) return NextResponse.json({ error: errMovs.message }, { status: 400 })

  const movs = (movsRaw ?? []) as { id: string; fecha: string; periodo_tarjeta: string | null }[]

  // Recalcular y actualizar solo las que cambian.
  let actualizadas = 0
  for (const m of movs) {
    const nuevoPeriodo = calcularPeriodoCuenta(m.fecha, cuenta)
    if (nuevoPeriodo === m.periodo_tarjeta) continue
    const { error } = await supabase
      .from('movimientos')
      .update({ periodo_tarjeta: nuevoPeriodo })
      .eq('id', m.id)
      .eq('user_id', user.id)
    if (!error) actualizadas++
  }

  revalidatePath('/conciliaciones')
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')

  return NextResponse.json({ ok: true, total: movs.length, actualizadas })
}
