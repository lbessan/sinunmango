import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { todayPartsAR } from '@/lib/timezone'
import { requireCronAuth } from '@/lib/cron-auth'
import { proponerVinculos, normalizarDetalle, type MovParaVincular, type GastoFijoParaVincular } from '@/lib/gastos-fijos-vinculo'

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
    .select('id, nombre_cuenta, fecha_vencimiento_tarjeta, fecha_cierre_pendiente, fecha_vencimiento_pendiente')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)

  if (errTarjetas) {
    return NextResponse.json({ error: errTarjetas.message }, { status: 500 })
  }

  const resultados = []
  const rotadas: { tarjeta: string; error: string | null }[] = []

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

  // ── Rotación de fechas pendientes ────────────────────────────────────────
  // Cuando el ciclo actual vence, las fechas del próximo ciclo (guardadas como
  // pendientes al conciliar) pasan a ser las activas. Comparamos por FECHA
  // completa (no solo el día) para ser robustos a días que el cron no corrió:
  // rotamos toda tarjeta cuyo vencimiento activo ya pasó y tiene pendiente.
  const inicioHoy = `${yAR}-${String(mAR).padStart(2, '0')}-${String(dAR).padStart(2, '0')}`
  for (const tarjeta of tarjetas ?? []) {
    const t = tarjeta as typeof tarjeta & {
      fecha_cierre_pendiente: string | null
      fecha_vencimiento_pendiente: string | null
    }
    if (!t.fecha_cierre_pendiente || !t.fecha_vencimiento_pendiente) continue
    if (!t.fecha_vencimiento_tarjeta) continue
    // Rotar solo si el vencimiento activo ya ocurrió (hoy >= venc activo).
    if (t.fecha_vencimiento_tarjeta > inicioHoy) continue

    const { error } = await adminClient
      .from('cuentas')
      .update({
        fecha_cierre_tarjeta:        t.fecha_cierre_pendiente,
        fecha_vencimiento_tarjeta:   t.fecha_vencimiento_pendiente,
        fecha_cierre_pendiente:      null,
        fecha_vencimiento_pendiente: null,
      })
      .eq('id', t.id)

    rotadas.push({ tarjeta: t.nombre_cuenta, error: error?.message ?? null })
  }

  // ── Vinculación automática movimiento ↔ gasto fijo ───────────────────────
  // Puebla movimientos.gasto_fijo_id para el período actual y el siguiente.
  // El link es lo que evita que las proyecciones resten un gasto fijo cuyo
  // consumo ya entró como movimiento (doble conteo). Reglas conservadoras en
  // lib/gastos-fijos-vinculo — ante ambigüedad no vincula (se puede a mano).
  const periodoActual = inicioMesActual
  const mSig = mAR === 12 ? 1 : mAR + 1
  const ySig = mAR === 12 ? yAR + 1 : yAR
  const periodoSig = `${ySig}-${String(mSig).padStart(2, '0')}-01`
  let vinculados = 0

  const [{ data: gfTodos }, { data: movsPeriodo }, { data: historialRaw }] = await Promise.all([
    adminClient.from('gastos_fijos')
      .select('id, nombre_gasto, monto_estimado, moneda, cuenta_pago_default, user_id')
      .eq('activo', true),
    adminClient.from('movimientos')
      .select('id, detalle, monto, moneda, cuenta_origen, tipo_movimiento, gasto_fijo_id, periodo_tarjeta, user_id')
      .in('periodo_tarjeta', [periodoActual, periodoSig]),
    // Historial: detalles ya vinculados a cada gasto fijo (la señal fuerte)
    adminClient.from('movimientos')
      .select('gasto_fijo_id, detalle')
      .not('gasto_fijo_id', 'is', null),
  ])

  const historial = new Map<string, Set<string>>()
  for (const h of historialRaw ?? []) {
    if (!h.gasto_fijo_id) continue
    const set = historial.get(h.gasto_fijo_id) ?? new Set<string>()
    set.add(normalizarDetalle(h.detalle))
    historial.set(h.gasto_fijo_id, set)
  }

  // Agrupar por usuario y por período — los vínculos son por período.
  const porUserPeriodo = new Map<string, MovParaVincular[]>()
  for (const m of movsPeriodo ?? []) {
    const key = `${m.user_id}|${m.periodo_tarjeta}`
    const arr = porUserPeriodo.get(key) ?? []
    arr.push(m as MovParaVincular)
    porUserPeriodo.set(key, arr)
  }
  const gfPorUser = new Map<string, GastoFijoParaVincular[]>()
  for (const g of gfTodos ?? []) {
    const arr = gfPorUser.get(g.user_id ?? '') ?? []
    arr.push(g as GastoFijoParaVincular)
    gfPorUser.set(g.user_id ?? '', arr)
  }

  for (const [key, movs] of porUserPeriodo) {
    const userId = key.split('|')[0]
    const gfs = gfPorUser.get(userId) ?? []
    if (gfs.length === 0) continue
    const propuestas = proponerVinculos(movs, gfs, historial)
    for (const v of propuestas) {
      const { error } = await adminClient
        .from('movimientos')
        .update({ gasto_fijo_id: v.gastoFijoId })
        .eq('id', v.movId)
      if (!error) vinculados++
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: today.toISOString(),
    procesadas: resultados,
    rotadas,
    vinculados,
  })
}
