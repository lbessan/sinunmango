import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { getUserFromRequest } from '@/lib/auth'

// ─── GET /api/dashboard-mobile ───────────────────────────────────────────────
// Returns dashboard summary + cuentas + últimos movimientos for the mobile app.
// Auth: Bearer token (JWT from mobile) OR session cookie (web).

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Run all queries in parallel
  const [
    { data: resumen, error: resumenError },
    { data: params },
    { data: cuentas },
    { data: movRecientes },
  ] = await Promise.all([
    adminClient
      .from('dashboard_resumen')
      .select('*')
      .eq('user_id', user.id)
      .single(),

    adminClient
      .from('parametros')
      .select('valor')
      .eq('id', 'Dolar_Tarjeta_BNA')
      .eq('user_id', user.id)
      .single(),

    // Cuentas con saldo calculado (view)
    adminClient
      .from('saldo_actual_cuentas')
      .select('id, nombre_cuenta, tipo_cuenta, moneda, saldo_actual, activa')
      .eq('activa', true)
      .eq('user_id', user.id)
      .order('tipo_cuenta'),

    // Últimos 10 movimientos con categoría
    adminClient
      .from('movimientos')
      .select('id, fecha, detalle, monto, moneda, tipo_movimiento, cuenta_origen, categorias(nombre_categoria, icono)')
      .eq('user_id', user.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (resumenError || !resumen) {
    return NextResponse.json({ error: 'No se encontró resumen' }, { status: 404 })
  }

  const dolar = params?.valor ?? 1410

  // Calcular proyectado a fin de mes
  const deudaRestante = Math.max(0, resumen.deuda_tarjetas_periodo - resumen.pagos_tarjeta_mes)
  const proyectadoActual = Math.round(
    resumen.disponible_real +
    resumen.ingresos_futuros_mes -
    resumen.gastos_fijos_pendientes -
    deudaRestante
  )

  // Mes actual formateado
  const today = new Date()
  const mesLabel = today
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .toUpperCase()
    .replace(' DE ', ' ')

  // Gastos e ingresos del período actual (desde el view, igual que la web)
  const gastosMes   = Math.abs(resumen.gastos_actuales ?? 0)
  const ingresosMes = resumen.ingresos_actuales ?? 0

  // Saldo total en USD (cuentas en USD, sin convertir)
  const saldoUsd = (cuentas ?? [])
    .filter(c => c.moneda === 'USD')
    .reduce((acc, c) => acc + (c.saldo_actual ?? 0), 0)

  // Mapear cuentas para el mobile
  const cuentasMapped = (cuentas ?? []).map(c => ({
    id:         c.id,
    nombre:     c.nombre_cuenta,
    tipo:       c.tipo_cuenta,
    moneda:     c.moneda,
    saldo:      Math.round(c.saldo_actual ?? 0),
  }))

  // Mapear movimientos recientes
  const movMapped = (movRecientes ?? []).map(m => {
    const catRaw = m.categorias as unknown
    const cat = (Array.isArray(catRaw) ? catRaw[0] : catRaw) as { nombre_categoria: string; icono: string } | null
    return {
      id:     m.id,
      fecha:  m.fecha,
      detalle: m.detalle ?? '',
      monto:  Math.round(Number(m.monto)),
      moneda: m.moneda,
      tipo:   m.tipo_movimiento,
      cuenta_id: m.cuenta_origen,
      categoria_nombre: cat?.nombre_categoria ?? null,
      categoria_icono:  cat?.icono ?? null,
    }
  })

  // Build cuenta name lookup for movimientos
  const cuentaMap = Object.fromEntries((cuentas ?? []).map(c => [c.id, c.nombre_cuenta]))
  const movConCuenta = movMapped.map(m => ({
    ...m,
    cuenta_nombre: cuentaMap[m.cuenta_id] ?? null,
  }))

  return NextResponse.json({
    mes_label:               mesLabel,
    saldo_disponible:        Math.round(resumen.disponible_real),
    saldo_usd:               Math.round(saldoUsd * 100) / 100,
    proyectado:              proyectadoActual,
    gastos_mes:              Math.round(gastosMes),
    ingresos_mes:            Math.round(ingresosMes),
    gastos_fijos_pendientes: Math.round(resumen.gastos_fijos_pendientes ?? 0),
    deuda_tarjetas:          Math.round(deudaRestante),
    dolar,
    cuentas:                 cuentasMapped,
    ultimos_movimientos:     movConCuenta,
  })
}
