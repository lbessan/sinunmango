import { adminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Este endpoint es llamado por el cron de Vercel diariamente a las 3am
// Replica la lógica de AppSheet: si HOY = día de vencimiento de la tarjeta,
// marca como conciliados todos los movimientos no conciliados con periodo <= mes anterior

export async function GET() {
  const today    = new Date()
  const todayDay = today.getDate()

  // Primer día del mes actual
  const inicioMesActual = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10)

  // Buscar tarjetas cuyo vencimiento es hoy
  const { data: tarjetas, error: errTarjetas } = await adminClient
    .from('cuentas')
    .select('id, nombre_cuenta, fecha_vencimiento_tarjeta')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)

  if (errTarjetas) {
    return NextResponse.json({ error: errTarjetas.message }, { status: 500 })
  }

  const resultados = []

  for (const tarjeta of tarjetas ?? []) {
    const venceDay = tarjeta.fecha_vencimiento_tarjeta
      ? new Date(tarjeta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate()
      : null

    if (venceDay !== todayDay) continue

    // Conciliar todos los movimientos no conciliados con periodo < mes actual
    const { data, error } = await adminClient
      .from('movimientos')
      .update({ conciliado: true })
      .eq('cuenta_origen', tarjeta.id)
      .eq('tipo_movimiento', 'Gasto')
      .eq('conciliado', false)
      .lt('periodo_tarjeta', inicioMesActual)

    resultados.push({
      tarjeta: tarjeta.nombre_cuenta,
      error: error?.message ?? null,
    })
  }

  return NextResponse.json({
    ok: true,
    fecha: today.toISOString(),
    procesadas: resultados.length,
    resultados,
  })
}
