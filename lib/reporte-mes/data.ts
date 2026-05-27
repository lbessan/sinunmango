import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// ─── Reporte mensual PDF — DATA LAYER ─────────────────────────────────────────
//
// Compila TODOS los datos del reporte de un mes en una sola estructura
// `ReporteMesData`. Después el layer de HTML toma esto y lo renderiza.
// Esta separación nos permite migrar el HTML/PDF a otra librería sin
// tocar el data crunching.
//
// Scoping: usa el `user_id` (workspace owner) que le pase quien llama —
// el endpoint resuelve effective plan y workspace antes.

export type ReporteMesData = {
  // Período
  mes:           string  // 'YYYY-MM'
  mesLabel:      string  // 'Mayo 2026'
  generadoEn:    string  // ISO de cuándo se generó (footer)

  // KPIs principales
  kpis: {
    ingresos:        number  // ARS
    gastos:          number  // ARS
    balance:         number  // ingresos - gastos
    gastosPctIng:    number  // gastos / ingresos * 100 (clamped 0-999)
    movimientosCount: number
  }

  // Distribución por categoría — top 8 + "Otros"
  porCategoria: Array<{
    categoria_nombre: string
    monto:            number
    pct:              number  // porcentaje sobre gastos totales
  }>

  // Top 10 gastos individuales del mes
  topGastos: Array<{
    fecha:    string
    detalle:  string
    monto:    number
    categoria: string
    cuenta:   string
  }>

  // Tarjetas con deuda del período
  tarjetas: Array<{
    nombre_cuenta: string
    deuda_ars:     number
    deuda_usd:     number
  }>

  // Saldo de cuentas al fin del mes (snapshot actual — aproximación si no
  // es el mes actual, pero el cierre real requeriría reconstruir histórico)
  cuentas: Array<{
    nombre_cuenta: string
    tipo_cuenta:   string
    moneda:        string
    saldo:         number
  }>
}

/**
 * Builds the report data structure for a given month.
 * `mes` debe ser 'YYYY-MM'. `userId` es el workspace owner (puede ser propio
 * o ajeno via share — el caller resuelve eso).
 */
export async function calcularReporteMes(
  supabase: SupabaseClient<Database>,
  userId:   string,
  mes:      string,  // YYYY-MM
): Promise<ReporteMesData> {
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new Error(`Mes inválido: ${mes}. Esperado YYYY-MM.`)
  }

  const desde = `${mes}-01`
  const hasta = mesSiguiente(mes)
  const inicioMesIso = `${mes}-01`

  // Paralelo: todas las queries de una.
  const [
    { data: movimientos },
    { data: categorias },
    { data: cuentas },
    { data: deudaTarjMovs },
    { data: saldos },
  ] = await Promise.all([
    // Movimientos del mes (no transferencias — afectan gastos/ingresos)
    supabase.from('movimientos_completos')
      .select('fecha, detalle, monto, moneda, tipo_movimiento, categoria_nombre, cuenta_origen_nombre')
      .eq('user_id', userId)
      .in('tipo_movimiento', ['Gasto', 'Ingreso'])
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('monto', { ascending: false }),

    // Categorías (sólo para mapeo de nombres si el view no lo trae)
    supabase.from('categorias')
      .select('id, nombre_categoria')
      .eq('user_id', userId),

    // Cuentas activas
    supabase.from('saldo_actual_cuentas')
      .select('nombre_cuenta, tipo_cuenta, moneda, saldo_actual')
      .eq('activa', true)
      .eq('user_id', userId),

    // Movs del mes EN tarjetas (para deuda del período actual)
    supabase.from('movimientos_completos')
      .select('monto, moneda, tipo_movimiento, cuenta_origen_nombre, cuenta_origen_tipo')
      .in('tipo_movimiento', ['Gasto', 'Ingreso'])
      .eq('periodo_tarjeta', inicioMesIso)
      .eq('cuenta_origen_tipo', 'Tarjeta Credito')
      .eq('user_id', userId),

    // Saldos por cuenta — sólo de billeteras y efectivo (no tarjetas, esas
    // van en deuda).
    supabase.from('saldo_actual_cuentas')
      .select('nombre_cuenta, tipo_cuenta, moneda, saldo_actual')
      .eq('activa', true)
      .eq('user_id', userId)
      .neq('tipo_cuenta', 'Tarjeta Credito'),
  ])

  // ── KPIs ─────────────────────────────────────────────────────────────
  const movs = movimientos ?? []
  let ingresos = 0
  let gastos   = 0
  for (const m of movs) {
    // Sumamos sólo ARS — USD se trataría aparte si quisiéramos un reporte
    // multi-moneda. Mantengo simple en v1.
    if (m.moneda !== 'ARS') continue
    const monto = Number(m.monto ?? 0)
    if (m.tipo_movimiento === 'Ingreso') ingresos += monto
    else if (m.tipo_movimiento === 'Gasto') gastos += monto
  }
  const balance = ingresos - gastos
  const gastosPctIng = ingresos > 0
    ? Math.min(Math.round((gastos / ingresos) * 100), 999)
    : 0

  // ── Distribución por categoría ───────────────────────────────────────
  const porCatMap = new Map<string, number>()
  for (const m of movs) {
    if (m.tipo_movimiento !== 'Gasto' || m.moneda !== 'ARS') continue
    const cat = m.categoria_nombre || 'Sin categoría'
    porCatMap.set(cat, (porCatMap.get(cat) ?? 0) + Number(m.monto ?? 0))
  }
  const todasLasCats = [...porCatMap.entries()]
    .map(([categoria_nombre, monto]) => ({ categoria_nombre, monto, pct: gastos > 0 ? (monto / gastos) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto)

  // Top 8 + agrupar el resto en "Otros"
  const porCategoria = todasLasCats.length <= 9
    ? todasLasCats
    : [
        ...todasLasCats.slice(0, 8),
        {
          categoria_nombre: 'Otros',
          monto:            todasLasCats.slice(8).reduce((s, x) => s + x.monto, 0),
          pct:              todasLasCats.slice(8).reduce((s, x) => s + x.pct, 0),
        },
      ]

  // ── Top 10 gastos individuales ───────────────────────────────────────
  const topGastos = movs
    .filter(m => m.tipo_movimiento === 'Gasto' && m.moneda === 'ARS')
    .slice(0, 10)
    .map(m => ({
      fecha:     m.fecha ?? '',
      detalle:   (m.detalle ?? '—').slice(0, 80),
      monto:     Number(m.monto ?? 0),
      categoria: m.categoria_nombre ?? '—',
      cuenta:    m.cuenta_origen_nombre ?? '—',
    }))

  // ── Tarjetas con deuda del período ───────────────────────────────────
  const tarjMap = new Map<string, { deuda_ars: number; deuda_usd: number }>()
  for (const m of deudaTarjMovs ?? []) {
    const tj = m.cuenta_origen_nombre ?? 'Sin cuenta'
    const signo = m.tipo_movimiento === 'Ingreso' ? -1 : 1
    const valor = Number(m.monto ?? 0) * signo
    const acc = tarjMap.get(tj) ?? { deuda_ars: 0, deuda_usd: 0 }
    if (m.moneda === 'USD') acc.deuda_usd += valor
    else                    acc.deuda_ars += valor
    tarjMap.set(tj, acc)
  }
  const tarjetas = [...tarjMap.entries()]
    .map(([nombre_cuenta, v]) => ({ nombre_cuenta, ...v }))
    .filter(t => t.deuda_ars > 0 || t.deuda_usd > 0)
    .sort((a, b) => b.deuda_ars - a.deuda_ars)

  // ── Saldos cuentas ───────────────────────────────────────────────────
  const cuentasOut = (saldos ?? [])
    .filter(c => c.tipo_cuenta !== 'Tarjeta Credito')
    .map(c => ({
      nombre_cuenta: c.nombre_cuenta ?? '—',
      tipo_cuenta:   c.tipo_cuenta ?? '—',
      moneda:        c.moneda ?? 'ARS',
      saldo:         Number(c.saldo_actual ?? 0),
    }))

  return {
    mes,
    mesLabel:    formatMesLabel(mes),
    generadoEn:  new Date().toISOString(),
    kpis: {
      ingresos,
      gastos,
      balance,
      gastosPctIng,
      movimientosCount: movs.length,
    },
    porCategoria,
    topGastos,
    tarjetas,
    cuentas: cuentasOut,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mesSiguiente(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const next = new Date(y, m, 1)  // m no -1 = mes siguiente, porque Date es 0-indexed
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
}

const MESES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
function formatMesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES_LABEL[m - 1] ?? mes} ${y}`
}
