import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { getUserFromRequest } from '@/lib/auth'

// ─── GET /api/dashboard-mobile ───────────────────────────────────────────────
// Returns a minimal dashboard summary for the mobile app.
// Auth: Bearer token (JWT from mobile) OR session cookie (web).

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. Dashboard summary view
  const { data: resumen, error } = await adminClient
    .from('dashboard_resumen')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error || !resumen) {
    return NextResponse.json({ error: 'No se encontró resumen' }, { status: 404 })
  }

  // 2. Dollar rate for USD conversion
  const { data: params } = await adminClient
    .from('parametros')
    .select('valor')
    .eq('id', 'Dolar_Tarjeta_BNA')
    .eq('user_id', user.id)
    .single()

  const dolar = params?.valor ?? 1410

  // 3. Tarjetas de crédito activas (para filtrar gastos)
  const { data: tarjetas } = await adminClient
    .from('cuentas')
    .select('id')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .eq('user_id', user.id)

  const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))

  // 4. Gastos fijos (solo efectivo/banco, para proyección a fin de mes)
  const { data: gastosFijos } = await adminClient
    .from('gastos_fijos')
    .select('*, cuentas(tipo_cuenta)')
    .eq('activo', true)
    .eq('user_id', user.id)

  const gastosFijosEfectivo = (gastosFijos ?? [])
    .filter(g => (g.cuentas as { tipo_cuenta: string } | null)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((acc, g) => acc + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado), 0)

  // 5. Calcular proyectado a fin de mes
  const deudaRestante  = Math.max(0, resumen.deuda_tarjetas_periodo - resumen.pagos_tarjeta_mes)
  const proyectadoActual = Math.round(
    resumen.disponible_real +
    resumen.ingresos_futuros_mes -
    resumen.gastos_fijos_pendientes -
    deudaRestante
  )

  // 6. Mes actual formateado
  const today = new Date()
  const mesLabel = today
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .toUpperCase()
    .replace(' DE ', ' ')

  // 7. Gastos e ingresos del mes desde movimientos
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  const firstOfMonthStr = firstOfMonth.toISOString().slice(0, 10)

  const { data: movMes } = await adminClient
    .from('movimientos')
    .select('monto, moneda, tipo_movimiento')
    .eq('user_id', user.id)
    .gte('fecha', firstOfMonthStr)

  const gastosMes = (movMes ?? [])
    .filter(m => m.tipo_movimiento === 'Gasto')
    .reduce((s, m) => s + (m.moneda === 'USD' ? Number(m.monto) * dolar : Number(m.monto)), 0)

  const ingresosMes = (movMes ?? [])
    .filter(m => m.tipo_movimiento === 'Ingreso')
    .reduce((s, m) => s + (m.moneda === 'USD' ? Number(m.monto) * dolar : Number(m.monto)), 0)

  return NextResponse.json({
    mes_label:        mesLabel,
    saldo_disponible: Math.round(resumen.disponible_real),
    proyectado:       proyectadoActual,
    gastos_mes:       Math.round(gastosMes),
    ingresos_mes:     Math.round(ingresosMes),
    gastos_fijos_pendientes: Math.round(resumen.gastos_fijos_pendientes ?? 0),
    deuda_tarjetas:   Math.round(deudaRestante),
  })
}
