import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getUserPlan } from '@/lib/subscription'
import { todayAR, todayPartsAR } from '@/lib/timezone'

// ─── GET /api/dashboard-mobile ───────────────────────────────────────────────
// Returns dashboard summary + cuentas + últimos movimientos for the mobile app.
// Auth: Bearer token (JWT from mobile) OR session cookie (web).
// Query params: ?mes=YYYY-MM (default: current month)

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parsear mes del query string
  const mesParam = req.nextUrl.searchParams.get('mes')

  // "Hoy" en zona Argentina (timezone-aware, sin manual offset)
  const { year: curYearAR, month: curMonthAR } = todayPartsAR()
  // curMonthAR es 1-12, lo pasamos a 0-11 para Date
  const curYear  = curYearAR
  const curMonth = curMonthAR - 1

  let mesDate: Date
  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    mesDate = new Date(`${mesParam}-01T12:00:00`)
  } else {
    mesDate = new Date(curYear, curMonth, 1)
  }

  const isMesActual = mesDate.getFullYear() === curYear && mesDate.getMonth() === curMonth

  // Para el mes actual, cortar en "hoy"; para meses pasados/futuros, usar rango completo
  const todayStr  = todayAR()
  const mesStart  = `${mesDate.getFullYear()}-${String(mesDate.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(mesDate.getFullYear(), mesDate.getMonth() + 1, 1)
  const mesEnd    = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
  const today     = todayStr

  const mesLabel = mesDate
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .toUpperCase()
    .replace(' DE ', ' ')

  // Run all queries in parallel (plan incluido)
  const [
    planInfo,
    [
      { data: resumen, error: resumenError },
      { data: params },
      { data: cuentas },
      { data: movRecientes },
      { data: movMes },
      { data: deudaTarjMovs },
    ],
  ] = await Promise.all([
    getUserPlan(supabase),
    Promise.all([
      supabase
        .from('dashboard_resumen')
        .select('*')
        .eq('user_id', user.id)
        .single(),

      supabase
        .from('parametros')
        .select('valor')
        .eq('id', 'Dolar_Tarjeta_BNA')
        .eq('user_id', user.id)
        .single(),

      // Cuentas con saldo calculado (view) — siempre el saldo actual
      supabase
        .from('saldo_actual_cuentas')
        .select('id, nombre_cuenta, tipo_cuenta, moneda, saldo_actual, activa')
        .eq('activa', true)
        .eq('user_id', user.id)
        .order('tipo_cuenta'),

      // Últimos 10 movimientos del mes seleccionado con categoría (hasta hoy si es mes actual)
      supabase
        .from('movimientos')
        .select('id, fecha, detalle, monto, moneda, tipo_movimiento, cuenta_origen, categorias(nombre_categoria, icono)')
        .eq('user_id', user.id)
        .gte('fecha', mesStart)
        .lte('fecha', isMesActual ? today : mesEnd.slice(0, 10))
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),

      // Movs del mes — para cash flow real (separar gastos no-tarjeta y pagos a tarjeta)
      supabase
        .from('movimientos_completos')
        .select('monto, monto_estimado, tipo_movimiento, cuenta_origen, cuenta_destino')
        .eq('user_id', user.id)
        .gte('fecha', mesStart)
        .lte('fecha', isMesActual ? today : mesEnd.slice(0, 10))
        .in('tipo_movimiento', ['Gasto', 'Ingreso', 'Transferencia']),

      // Movs sobre tarjetas del período actual — para desglose ARS/USD nativo de la deuda
      supabase
        .from('movimientos_completos')
        .select('monto, moneda, tipo_movimiento, cuenta_origen_tipo')
        .in('tipo_movimiento', ['Gasto', 'Ingreso'])
        .eq('periodo_tarjeta', mesStart)
        .eq('cuenta_origen_tipo', 'Tarjeta Credito')
        .eq('user_id', user.id),
    ]),
  ])

  if (resumenError || !resumen) {
    return NextResponse.json({ error: 'No se encontró resumen' }, { status: 404 })
  }

  const dolar = params?.valor ?? 1410

  // Set de IDs de tarjetas para filtros cash flow
  const tarjetaIds = new Set(
    (cuentas ?? []).filter(c => c.tipo_cuenta === 'Tarjeta Credito').map(c => c.id)
  )

  // Cash flow real: gastos = gastos con cuenta_origen NO tarjeta + transferencias con destino tarjeta (= pagos a tarjeta)
  // Antes sumábamos TODOS los gastos del mes (incluyendo consumos con tarjeta) y eso doble-contaba
  // contra deuda_tarjetas_periodo. Ahora "gasto del mes" = lo que SALE del cash real.
  const gastosMes = (movMes ?? [])
    .filter(m => {
      if (m.tipo_movimiento === 'Gasto'         && m.cuenta_origen  && !tarjetaIds.has(m.cuenta_origen))  return true
      if (m.tipo_movimiento === 'Transferencia' && m.cuenta_destino &&  tarjetaIds.has(m.cuenta_destino)) return true
      return false
    })
    .reduce((acc, m) => acc + Math.abs(Number(m.monto_estimado ?? m.monto)), 0)

  // Ingresos del mes: todos los Ingresos (incluye reintegros a tarjeta, igual que web `ingresos_actuales`)
  const ingresosMes = (movMes ?? [])
    .filter(m => m.tipo_movimiento === 'Ingreso')
    .reduce((acc, m) => acc + Number(m.monto_estimado ?? m.monto), 0)

  // Desglose ARS/USD nativo de la deuda tarjetas del período (Ingresos a tarjeta restan)
  let deudaArs = 0
  let deudaUsd = 0
  for (const m of deudaTarjMovs ?? []) {
    const signo = m.tipo_movimiento === 'Ingreso' ? -1 : 1
    const raw   = (Number(m.monto) || 0) * signo
    if (m.moneda === 'USD') deudaUsd += raw
    else                    deudaArs += raw
  }

  // Calcular proyectado a fin de mes (solo para mes actual)
  const deudaRestante = Math.max(0, (resumen.deuda_tarjetas_periodo ?? 0) - (resumen.pagos_tarjeta_mes ?? 0))
  const proyectadoActual = Math.round(
    (resumen.disponible_real ?? 0) +
    (resumen.ingresos_futuros_mes ?? 0) -
    (resumen.gastos_fijos_pendientes ?? 0) -
    deudaRestante
  )

  // Saldo total en USD (cuentas en USD, sin convertir)
  const saldoUsd = (cuentas ?? [])
    .filter(c => c.moneda === 'USD')
    .reduce((acc, c) => acc + (c.saldo_actual ?? 0), 0)

  // Mapear cuentas para el mobile
  const cuentasMapped = (cuentas ?? []).map(c => ({
    id:     c.id,
    nombre: c.nombre_cuenta,
    tipo:   c.tipo_cuenta,
    moneda: c.moneda,
    saldo:  Math.round(c.saldo_actual ?? 0),
  }))

  // Build cuenta name lookup
  const cuentaMap = Object.fromEntries((cuentas ?? []).map(c => [c.id, c.nombre_cuenta]))

  // Mapear movimientos recientes
  const movConCuenta = (movRecientes ?? []).map(m => {
    const catRaw = m.categorias as unknown
    const cat = (Array.isArray(catRaw) ? catRaw[0] : catRaw) as { nombre_categoria: string; icono: string } | null
    return {
      id:               m.id,
      fecha:            m.fecha,
      detalle:          m.detalle ?? '',
      monto:            Math.round(Number(m.monto)),
      moneda:           m.moneda,
      tipo:             m.tipo_movimiento,
      cuenta_nombre:    (m.cuenta_origen != null ? cuentaMap[m.cuenta_origen] : null) ?? null,
      categoria_nombre: cat?.nombre_categoria ?? null,
      categoria_icono:  cat?.icono ?? null,
    }
  })

  return NextResponse.json({
    plan:                    planInfo.plan,
    has_pro_access:          planInfo.has_pro_access,
    mes_label:               mesLabel,
    mes:                     `${mesDate.getFullYear()}-${String(mesDate.getMonth() + 1).padStart(2, '0')}`,
    saldo_disponible:        Math.round(resumen.disponible_real ?? 0),
    saldo_usd:               Math.round(saldoUsd * 100) / 100,
    proyectado:              proyectadoActual,
    gastos_mes:              Math.round(gastosMes),
    ingresos_mes:            Math.round(ingresosMes),
    gastos_fijos_pendientes: Math.round(resumen.gastos_fijos_pendientes ?? 0),
    deuda_tarjetas:          Math.round(deudaRestante),
    deuda_tarjetas_ars:      Math.round(deudaArs),
    deuda_tarjetas_usd:      Math.round(deudaUsd * 100) / 100,
    dolar,
    cuentas:                 cuentasMapped,
    ultimos_movimientos:     movConCuenta,
  })
}
