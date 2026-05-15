import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { todayPartsAR } from '@/lib/timezone'
import { requireCronAuth } from '@/lib/cron-auth'

// Este endpoint es llamado por el cron de Vercel diariamente.
// Si HOY = día de vencimiento de una tarjeta, marca como conciliados todos
// los movimientos no conciliados con periodo <= mes anterior de esa tarjeta.

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const { year: yAR, month: mAR, day: dAR } = todayPartsAR()
  const today    = new Date(yAR, mAR - 1, dAR)
  const todayDay = dAR

  // Primer día del mes actual (en AR)
  const inicioMesActual = `${yAR}-${String(mAR).padStart(2, '0')}-01`

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
    const { error } = await adminClient
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
    procesadas: resultados,
  })
}
