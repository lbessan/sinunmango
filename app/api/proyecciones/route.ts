import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { todayPartsAR } from '@/lib/timezone'

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meses = parseInt(new URL(req.url).searchParams.get('meses') ?? '4')
  const { year: yAR, month: mAR } = todayPartsAR()
  const today = new Date(yAR, mAR - 1, 1)

  // ── Datos base ────────────────────────────────────────────────────────────
  const [{ data: resumen }, { data: gastosFijos }, { data: tarjetas }, { data: params }] =
    await Promise.all([
      supabase.from('dashboard_resumen').select('*').eq('user_id', user.id).single(),
      supabase.from('gastos_fijos')
        .select('*, cuentas(tipo_cuenta)')
        .eq('activo', true).eq('user_id', user.id),
      supabase.from('cuentas')
        .select('id')
        .eq('tipo_cuenta', 'Tarjeta Credito')
        .eq('activa', true).eq('user_id', user.id),
      supabase.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', user.id).single(),
    ])

  if (!resumen) return NextResponse.json({ error: 'Sin datos' }, { status: 500 })

  const dolarBna   = params?.valor ?? 1410
  const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))

  // Proyectado fin de mes actual (punto de partida)
  const deudaRestante = Math.max(0, (resumen.deuda_tarjetas_periodo ?? 0) - (resumen.pagos_tarjeta_mes ?? 0))
  const proyectadoActual =
    (resumen.disponible_real ?? 0) +
    (resumen.ingresos_futuros_mes ?? 0) -
    (resumen.gastos_fijos_pendientes ?? 0) -
    deudaRestante

  // Gastos fijos mensuales que se pagan en efectivo/banco (recurrentes)
  const gastosFijosEfectivo = (gastosFijos ?? [])
    .filter(g => (g.cuentas as { tipo_cuenta?: string } | null)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((acc, g) => {
      const monto = g.moneda === 'USD' ? g.monto_estimado * dolarBna : g.monto_estimado
      return acc + monto
    }, 0)

  // ── Calcular proyección para cada mes futuro ──────────────────────────────
  const proyecciones = []
  let saldoAcumulado = proyectadoActual

  for (let i = 1; i <= meses; i++) {
    const fecha   = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const periodo = fecha.toISOString().slice(0, 10) // YYYY-MM-01

    // Ingresos ya cargados para ese mes
    const { data: ingresos } = await supabase
      .from('movimientos')
      .select('monto, moneda, cotizacion, conciliado')
      .eq('tipo_movimiento', 'Ingreso')
      .eq('periodo_tarjeta', periodo)
      .eq('user_id', user.id)

    const totalIngresos = (ingresos ?? []).reduce((acc, m) => {
      const monto = m.moneda === 'USD'
        ? (m.conciliado ? m.monto * (m.cotizacion ?? dolarBna) : m.monto * dolarBna)
        : m.monto
      return acc + monto
    }, 0)

    // Gastos de tarjeta ya cargados para ese periodo (cuotas futuras)
    const { data: gastosTC } = await supabase
      .from('movimientos')
      .select('monto, moneda, cotizacion, conciliado, cuenta_origen')
      .eq('tipo_movimiento', 'Gasto')
      .eq('periodo_tarjeta', periodo)
      .eq('user_id', user.id)

    const totalGastosTC = (gastosTC ?? [])
      .filter(m => m.cuenta_origen != null && tarjetaIds.has(m.cuenta_origen))
      .reduce((acc, m) => {
        const monto = m.moneda === 'USD'
          ? (m.conciliado ? m.monto * (m.cotizacion ?? dolarBna) : m.monto * dolarBna)
          : m.monto
        return acc + monto
      }, 0)

    const proyeccion = saldoAcumulado + totalIngresos - gastosFijosEfectivo - totalGastosTC
    saldoAcumulado   = proyeccion

    proyecciones.push({
      periodo,
      label: fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase()),
      saldo_inicial:  Math.round(saldoAcumulado === proyeccion ? saldoAcumulado - totalIngresos + gastosFijosEfectivo + totalGastosTC : 0),
      ingresos:       Math.round(totalIngresos),
      gastos_fijos:   Math.round(gastosFijosEfectivo),
      gastos_tarjeta: Math.round(totalGastosTC),
      proyeccion:     Math.round(proyeccion),
    })
  }

  return NextResponse.json({
    proyectado_actual: Math.round(proyectadoActual),
    gastos_fijos_efectivo_mensual: Math.round(gastosFijosEfectivo),
    proyecciones,
  })
}
