import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type React from 'react'
import { TourTrigger } from '@/components/tour-trigger'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${fmt(n)}`
}

// ─── Month helpers ────────────────────────────────────────────────────────────
function currentMes(today: Date) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function parseMes(param: string | undefined, today: Date): string {
  const cur = currentMes(today)
  if (!param || !/^\d{4}-\d{2}$/.test(param)) return cur
  return param
}

function offsetMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1)
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(' de ', ' ')
    .replace(/^\w/, c => c.toUpperCase())
}

// ─── Thumbnail (same as before) ───────────────────────────────────────────────
function labelTipo(tipo: string): string {
  switch (tipo) {
    case 'Banco CA':        return 'Caja de Ahorro'
    case 'Banco CC':        return 'Cuenta Corriente'
    case 'Billetera':       return 'Billetera virtual'
    case 'Billetera/Banco': return 'Banco / Billetera'
    case 'Efectivo':        return 'Efectivo'
    default:                return tipo
  }
}

function Thumbnail({ imagenUrl, colorPrim, tipo, nombre, moneda }: {
  imagenUrl?: string | null; colorPrim: string; tipo: string; nombre: string; moneda?: string | null
}) {
  if (tipo === 'Tarjeta Credito') {
    return (
      <div className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ width: 96, height: 61, background: colorPrim }}>
        {imagenUrl
          ? <img src={imagenUrl} alt={nombre} className="w-full h-full object-contain" />
          : <span className="text-lg">💳</span>}
      </div>
    )
  }
  const efectivoSrc = tipo === 'Efectivo' ? (moneda === 'USD' ? '/logo_dollar.png' : '/logo_peso.png') : null
  const src = imagenUrl ?? efectivoSrc
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 overflow-hidden" style={{ background: '#f1f5f9' }}>
      {src ? <img src={src} alt={nombre} className="w-8 h-8 object-contain p-0.5 rounded-lg" /> : <span>🏦</span>}
    </div>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ href, label, value, sub, accent }: {
  href?: string; label: string; value: string; sub: string
  accent: 'emerald' | 'red' | 'amber' | 'blue' | 'slate'
}) {
  const styles = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-400', text: 'text-emerald-700' },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',     dot: 'bg-red-400',     text: 'text-red-700'     },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   dot: 'bg-amber-400',   text: 'text-amber-700'   },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    dot: 'bg-blue-400',    text: 'text-blue-700'    },
    slate:   { bg: 'bg-slate-50',   border: 'border-slate-100',   dot: 'bg-slate-400',   text: 'text-slate-700'   },
  }
  const s = styles[accent]
  const inner = (
    <div className={`${s.bg} border ${s.border} rounded-xl p-4 ${href ? 'hover:shadow-sm transition-all group' : ''} h-full`}>
      <div className={`w-2 h-2 rounded-full ${s.dot} mb-3`} />
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <p className={`text-xl font-bold ${s.text} leading-none`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      {href && <p className="text-xs text-slate-300 mt-2 group-hover:text-slate-400 transition-colors">Ver detalle →</p>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>
}

// ─── Month navigation — solo las flechas, sin el título ──────────────────────
// ─── Banner full-bleed (igual al de conciliaciones) ──────────────────────────
function DashboardBanner({
  mes, tipo, metricaIzq, metricaDer,
}: {
  mes:  string
  tipo: 'pasado' | 'actual' | 'futuro'
  metricaIzq: { label: string; value: React.ReactNode; sub: string }
  metricaDer:  { label: string; value: React.ReactNode; sub: string }
}) {
  const badge      = tipo === 'actual' ? 'Mes actual' : tipo === 'pasado' ? 'Período cerrado' : 'Proyección'
  const bigLabel   = mesLabel(mes).toUpperCase().replace(' ', ' ')   // non-breaking space

  return (
    <div
      className="-mx-8 -mt-8 mb-8 text-white"
      style={{ background: 'linear-gradient(135deg, var(--sidebar-bg,#07192b) 0%, var(--accent2,#0b2d55) 50%, var(--accent,#0f4d3a) 100%)' }}
    >
      <div className="px-10 pt-10 pb-9">
        {/* Top row: label izquierda + mes derecha */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">Resumen financiero</p>
            <p className="text-sm text-white/45">
              {badge}
            </p>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black tracking-tight text-white leading-none text-right">
            {bigLabel}
          </h1>
        </div>

        {/* Dos métricas centradas */}
        <div className="grid grid-cols-2 gap-16 max-w-2xl mx-auto text-center mb-10">
          <div>
            <p className="text-xs font-semibold text-white/55 uppercase tracking-widest mb-3">{metricaIzq.label}</p>
            <div className="text-4xl font-bold text-white mb-1">{metricaIzq.value}</div>
            <p className="text-xs text-white/40">{metricaIzq.sub}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-white/55 uppercase tracking-widest mb-3">{metricaDer.label}</p>
            <div className="text-4xl font-bold text-white mb-1">{metricaDer.value}</div>
            <p className="text-xs text-white/40">{metricaDer.sub}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Flechas de navegación (botones circulares, fuera del banner) ─────────────
function NavArrow({ mes, dir }: { mes: string; dir: 'prev' | 'next' }) {
  const target = offsetMes(mes, dir === 'prev' ? -1 : 1)
  const label  = mesLabel(target).split(' ')[0]
  return (
    <div className="shrink-0 w-14 flex justify-center">
      <Link href={`/dashboard?mes=${target}`} className="flex flex-col items-center gap-2 group">
        <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-sm border border-slate-200 bg-white group-hover:shadow-md group-hover:border-slate-300 transition-all">
          {dir === 'prev'
            ? <ChevronLeft  size={20} className="text-slate-500 group-hover:text-slate-700 transition-colors" />
            : <ChevronRight size={20} className="text-slate-500 group-hover:text-slate-700 transition-colors" />
          }
        </div>
        <span className="text-[11px] text-slate-400 font-medium group-hover:text-slate-600 transition-colors leading-tight">
          {label}
        </span>
      </Link>
    </div>
  )
}

// ─── Proyecciones (flexible — muestra 4 meses a partir de `desde`) ────────────
async function calcularProyecciones(userId: string, desde: string, meses = 4) {
  /**
   * `desde`: mes a partir del cual proyectar (exclusive).
   *   e.g. si desde='2026-05', el loop genera Jun, Jul, Ago, Sep.
   * Retorna:
   *   saldoBase: proyección acumulada al FINAL de `desde` (el hero del mes futuro)
   *   proyecciones: los `meses` meses siguientes a `desde`
   */
  const today  = new Date()
  const curMes = currentMes(today)

  // Partimos del resumen actual para obtener el saldo disponible de hoy
  const [{ data: resumen }, { data: gastosFijosRaw }, { data: tarjetasRaw }, { data: params }] =
    await Promise.all([
      adminClient.from('dashboard_resumen').select('*').eq('user_id', userId).single(),
      adminClient.from('gastos_fijos').select('*, cuentas(tipo_cuenta)').eq('activo', true).eq('user_id', userId),
      adminClient.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('activa', true).eq('user_id', userId),
      adminClient.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', userId).single(),
    ])

  if (!resumen) return { saldoBase: 0, proyecciones: [] as ProyeccionMes[] }

  const dolar       = params?.valor ?? 1410
  const tarjetaIds  = new Set((tarjetasRaw ?? []).map(t => t.id))
  const deudaRest   = Math.max(0, resumen.deuda_tarjetas_periodo - resumen.pagos_tarjeta_mes)
  const startSaldo  = resumen.disponible_real + resumen.ingresos_futuros_mes - resumen.gastos_fijos_pendientes - deudaRest
  const gastosFijosEfectivo = (gastosFijosRaw ?? [])
    .filter(g => (g.cuentas as any)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((a, g) => a + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado), 0)

  // Cuántos meses hay entre curMes y desde
  const [cy, cm]  = curMes.split('-').map(Number)
  const [dy, dm]  = desde.split('-').map(Number)
  const skipCount = (dy - cy) * 12 + (dm - cm)  // meses desde curMes hasta `desde` (puede ser 0)
  const totalLoop = skipCount + meses

  let saldo     = Math.round(startSaldo)
  let saldoBase = saldo  // se actualiza al llegar a `desde`
  const proyecciones: ProyeccionMes[] = []

  for (let i = 1; i <= totalLoop; i++) {
    const fecha   = new Date(cy, cm - 1 + i, 1)
    const periodo = fecha.toISOString().slice(0, 10)

    const [{ data: ingresos }, { data: gastosTC }] = await Promise.all([
      adminClient.from('movimientos').select('monto, moneda')
        .eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', periodo).eq('user_id', userId),
      adminClient.from('movimientos').select('monto, moneda, cuenta_origen')
        .eq('tipo_movimiento', 'Gasto').eq('periodo_tarjeta', periodo).eq('user_id', userId),
    ])

    const totalIng = (ingresos ?? []).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    const totalTC  = (gastosTC ?? []).filter(m => tarjetaIds.has(m.cuenta_origen)).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    saldo = Math.round(saldo + totalIng - gastosFijosEfectivo - totalTC)

    if (i === skipCount) {
      // Llegamos al final de `desde`
      saldoBase = saldo
    }

    if (i > skipCount) {
      // Este mes va en las tarjetas de proyección
      const label = fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
        .replace(' de ', ' ').replace(/^\w/, c => c.toUpperCase())
      const prev = i === skipCount + 1 ? saldoBase : proyecciones[proyecciones.length - 1].proyeccion
      proyecciones.push({
        periodo, label,
        ingresos:       Math.round(totalIng),
        gastos_fijos:   Math.round(gastosFijosEfectivo),
        gastos_tarjeta: Math.round(totalTC),
        proyeccion:     saldo,
        diferencia:     saldo - prev,
      })
    }
  }

  return { saldoBase, proyecciones }
}

type ProyeccionMes = {
  periodo: string; label: string
  ingresos: number; gastos_fijos: number; gastos_tarjeta: number
  proyeccion: number; diferencia: number
}

// ─── Past month data ──────────────────────────────────────────────────────────
async function fetchPastMonth(userId: string, mes: string) {
  const start = `${mes}-01`
  const end   = `${offsetMes(mes, 1)}-01`

  const [{ data: movs }, { data: tcuentas }] = await Promise.all([
    adminClient.from('movimientos')
      .select('id, fecha, detalle, monto, moneda, tipo_movimiento, cuenta_origen, periodo_tarjeta, categorias(nombre_categoria, icono)')
      .eq('user_id', userId)
      .gte('fecha', start)
      .lt('fecha', end)
      .order('fecha', { ascending: false }),
    adminClient.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', userId),
  ])

  const tarjetaIds = new Set((tcuentas ?? []).map(t => t.id))
  const all = movs ?? []

  const ingresos  = all.filter(m => m.tipo_movimiento === 'Ingreso').reduce((s, m) => s + m.monto, 0)
  const gastos    = all.filter(m => m.tipo_movimiento === 'Gasto').reduce((s, m) => s + m.monto, 0)
  const deudaTC   = all
    .filter(m => m.tipo_movimiento === 'Gasto' && tarjetaIds.has(m.cuenta_origen ?? '') && m.periodo_tarjeta === start)
    .reduce((s, m) => s + m.monto, 0)

  // Top categorías
  const catMap: Record<string, { nombre: string; icono: string; total: number }> = {}
  for (const m of all.filter(m => m.tipo_movimiento === 'Gasto')) {
    const cat = m.categorias as any
    const key = cat?.nombre_categoria ?? 'Sin categoría'
    if (!catMap[key]) catMap[key] = { nombre: key, icono: cat?.icono ?? '📦', total: 0 }
    catMap[key].total += m.monto
  }
  const topCats = Object.values(catMap).sort((a, b) => b.total - a.total).slice(0, 5)

  return {
    ingresos:  Math.round(ingresos),
    gastos:    Math.round(gastos),
    resultado: Math.round(ingresos - gastos),
    deudaTC:   Math.round(deudaTC),
    topCats,
    movimientos: all.slice(0, 30),
  }
}

// ─── Future month extra data (cuotas TC cargadas + gastos fijos) ──────────────
async function fetchFutureMonth(userId: string, mes: string) {
  const mesStart = `${mes}-01`

  const [{ data: cuotasRaw }, { data: gastosFijos }, { data: tcuentas }] = await Promise.all([
    adminClient.from('movimientos')
      .select('id, detalle, monto, moneda, cuenta_origen, cuentas(nombre_cuenta, imagen_url, color_primario)')
      .eq('user_id', userId)
      .eq('tipo_movimiento', 'Gasto')
      .eq('periodo_tarjeta', mesStart),
    adminClient.from('gastos_fijos')
      .select('*, cuentas(nombre_cuenta, tipo_cuenta)')
      .eq('activo', true).eq('user_id', userId).order('dia_vencimiento'),
    adminClient.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', userId),
  ])

  const tarjetaIds   = new Set((tcuentas ?? []).map(t => t.id))
  const cuotasTC     = (cuotasRaw ?? []).filter(m => tarjetaIds.has(m.cuenta_origen ?? ''))
  const totalCuotasTC = cuotasTC.reduce((s, m) => s + m.monto, 0)
  const totalGF       = (gastosFijos ?? []).reduce((s, g) => s + (g.monto_estimado ?? 0), 0)

  return {
    cuotasTC,
    totalCuotasTC: Math.round(totalCuotasTC),
    gastosFijos:   gastosFijos ?? [],
    totalGF:       Math.round(totalGF),
  }
}

// ─── Proyecciones card strip (shared) ────────────────────────────────────────
function ProyeccionesStrip({
  proyecciones, saldoBase, label,
}: {
  proyecciones: ProyeccionMes[]; saldoBase: number; label: string
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-8 rounded-full shrink-0"
          style={{ background: 'linear-gradient(to bottom, var(--accent2, #0d3b6e), var(--accent, #1a6b5a))' }} />
        <div className="flex-1 flex items-baseline justify-between gap-4">
          <h2 className="text-base font-bold text-slate-800 tracking-tight">{label}</h2>
          <p className="text-xs text-slate-400 hidden sm:block">Basado en movimientos cargados y gastos fijos</p>
        </div>
      </div>
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {proyecciones.map((p) => {
            const esPositivo = p.proyeccion >= 0
            return (
              <Link key={p.periodo} href={`/dashboard?mes=${p.periodo.slice(0, 7)}`}
                className="bg-white rounded-xl border border-slate-100 p-4 hover:border-slate-200 hover:shadow-sm transition-all group block relative overflow-hidden">
                <div className="absolute top-0 right-0 w-14 h-14 rounded-bl-full opacity-20"
                  style={{ background: esPositivo ? '#dcfce7' : '#fee2e2' }} />
                <p className="text-xs font-medium text-slate-500 mb-2 relative z-10">{p.label}</p>
                <p className="text-xl font-bold relative z-10" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
                  {p.proyeccion < 0 ? '-' : ''}${fmt(Math.abs(p.proyeccion))}
                </p>
                <div className="flex items-center gap-1 mt-1 relative z-10">
                  <span className={`text-xs font-medium ${p.diferencia >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {p.diferencia >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p.diferencia))}
                  </span>
                  <span className="text-xs text-slate-400">vs anterior</span>
                </div>
                <div className="mt-2 space-y-0.5 relative z-10">
                  {p.ingresos > 0 && <p className="text-xs text-slate-400">+${fmt(p.ingresos)} ingresos</p>}
                  <p className="text-xs text-slate-400">-${fmt(p.gastos_fijos + p.gastos_tarjeta)} gastos</p>
                </div>
                <p className="text-xs text-slate-300 mt-2 group-hover:text-slate-400 transition-colors relative z-10">Ver mes →</p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; mes?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params  = await searchParams
  const today   = new Date()
  const todayDay = today.getDate()
  const cur     = currentMes(today)
  const mes     = parseMes(params.mes, today)
  const tipo    = mes < cur ? 'pasado' : mes > cur ? 'futuro' : 'actual'
  const label   = mesLabel(mes).toUpperCase().replace(' ', ' ') // MAYO 2026

  // ── CURRENT MONTH ──────────────────────────────────────────────────────────
  if (tipo === 'actual') {
    const [{ data: resumen }, { data: cuentas }, { data: gastosFijos }, { data: cuentasExtra },
      { saldoBase: proyectadoActual, proyecciones }] = await Promise.all([
      adminClient.from('dashboard_resumen').select('*').eq('user_id', user.id).single(),
      adminClient.from('saldo_actual_cuentas').select('*').eq('activa', true).eq('user_id', user.id),
      adminClient.from('gastos_fijos').select('*, cuentas(nombre_cuenta, tipo_cuenta)').eq('activo', true).eq('user_id', user.id).order('dia_vencimiento'),
      adminClient.from('cuentas').select('id, imagen_url, color_primario').eq('user_id', user.id),
      calcularProyecciones(user.id, cur, 4),
    ])

    if (!resumen) return <EmptyState />

    const extraMap = Object.fromEntries((cuentasExtra ?? []).map(c => [c.id, c]))
    const gastosFijosProximos = (gastosFijos ?? [])
      .filter(g => (g.dia_vencimiento ?? 0) >= todayDay)
      .sort((a, b) => (a.dia_vencimiento ?? 0) - (b.dia_vencimiento ?? 0))
    const cuentasEfectivo = (cuentas ?? []).filter(c => c.tipo_cuenta !== 'Tarjeta Credito')
    const tarjetas        = (cuentas ?? []).filter(c => c.tipo_cuenta === 'Tarjeta Credito')

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <DashboardBanner
          mes={mes}
          tipo="actual"
          metricaIzq={{ label: 'Saldo disponible', value: `$${fmt(resumen.disponible_real)}`, sub: 'Suma de billeteras y efectivo ARS' }}
          metricaDer={{
            label: 'Proyectado fin de mes',
            value: <span className={proyectadoActual >= 0 ? 'text-emerald-300' : 'text-red-300'}>{proyectadoActual < 0 ? '-' : ''}${fmt(Math.abs(proyectadoActual))}</span>,
            sub:   'Liquidez estimada',
          }}
        />
        <div className="flex items-start gap-3">
          <NavArrow mes={mes} dir="prev" />
          <div className="flex-1 min-w-0 space-y-6">

        {/* KPIs */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">Indicadores del mes</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard href="/resumen?tipo=ingresos"  label="Ingresos actuales" value={`$${fmt(resumen.ingresos_actuales)}`}          sub="Cobrados este mes"   accent="emerald" />
            <KpiCard href="/resumen?tipo=gastos"    label="Gastos actuales"   value={`$${fmt(resumen.gastos_actuales)}`}            sub="Gastado en el mes"   accent="red"     />
            <KpiCard href="/resumen?tipo=tarjetas"  label="Deuda tarjetas"    value={`$${fmt(resumen.deuda_tarjetas_periodo)}`}     sub="Período actual"      accent="amber"   />
            <KpiCard href="/resumen?tipo=proyectado" label="Proyectado EOM"   value={`${proyectadoActual < 0 ? '-' : ''}$${fmt(Math.abs(proyectadoActual))}`} sub="Liquidez estimada" accent={proyectadoActual >= 0 ? 'emerald' : 'red'} />
          </div>
        </div>

        {/* Proyecciones */}
        <ProyeccionesStrip proyecciones={proyecciones} saldoBase={proyectadoActual} label="Proyecciones Mensuales" />

        {/* Cuentas + Gastos fijos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Estado de cuentas</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {cuentasEfectivo.map(c => {
                const extra = extraMap[c.id]
                return (
                  <Link key={c.id} href={`/cuentas/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Thumbnail imagenUrl={extra?.imagen_url} colorPrim={extra?.color_primario ?? '#0d3b6e'} tipo={c.tipo_cuenta} nombre={c.nombre_cuenta} moneda={c.moneda} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{c.nombre_cuenta}</p>
                        <p className="text-xs text-slate-400">{labelTipo(c.tipo_cuenta)}</p>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold ${(c.saldo_actual ?? 0) < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                      {c.moneda === 'USD' ? 'US$' : '$'}{fmt(c.saldo_actual ?? 0)}
                    </p>
                  </Link>
                )
              })}
            </div>
            <div className="px-5 py-2 border-t border-slate-50 bg-slate-50/60">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tarjetas de crédito</p>
            </div>
            <div className="divide-y divide-slate-50">
              {tarjetas.map(c => {
                const extra  = extraMap[c.id]
                const cierre = c.fecha_cierre_tarjeta ? new Date(c.fecha_cierre_tarjeta + 'T12:00:00').getDate() : '—'
                const vence  = c.fecha_vencimiento_tarjeta ? new Date(c.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : '—'
                return (
                  <Link key={c.id} href={`/tarjetas/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Thumbnail imagenUrl={extra?.imagen_url} colorPrim={extra?.color_primario ?? '#0d3b6e'} tipo={c.tipo_cuenta} nombre={c.nombre_cuenta} moneda={c.moneda} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{c.nombre_cuenta}</p>
                        <p className="text-xs text-slate-400">Cierre {cierre} · Vence {vence}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${(c.saldo_actual ?? 0) < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                        ${fmt(c.saldo_actual ?? 0)}
                      </p>
                      <p className="text-xs text-slate-400">acumulado</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-50">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Gastos fijos por vencer</h2>
                <p className="text-xs text-slate-400 mt-0.5">Pendientes este mes · día {todayDay} en adelante</p>
              </div>
              <Link href="/gastos-fijos" className="text-xs text-blue-500 hover:text-blue-700 underline whitespace-nowrap">Ver todos</Link>
            </div>
            {gastosFijosProximos.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-emerald-600 font-medium">✓ Todo al día</p>
                <p className="text-xs text-slate-400 mt-1">No quedan gastos fijos pendientes este mes</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                {gastosFijosProximos.map(g => {
                  const esTarjeta = (g.cuentas as any)?.tipo_cuenta === 'Tarjeta Credito'
                  const hoy       = g.dia_vencimiento === todayDay
                  const diasResta = (g.dia_vencimiento ?? 0) - todayDay
                  return (
                    <div key={g.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${hoy ? 'bg-red-400 animate-pulse' : diasResta <= 3 ? 'bg-amber-400' : esTarjeta ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                        <div>
                          <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                          <p className="text-xs text-slate-400">Día {g.dia_vencimiento} · {(g.cuentas as any)?.nombre_cuenta ?? '—'}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-medium text-slate-800">${fmt(g.monto_estimado ?? 0)}</p>
                        <p className={`text-xs ${hoy ? 'text-red-500 font-medium' : diasResta <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {hoy ? 'vence hoy' : diasResta === 1 ? 'mañana' : `en ${diasResta} días`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
          </div>{/* flex-1 */}
          <NavArrow mes={mes} dir="next" />
        </div>{/* flex nav */}
        {params.tour === '1' && <TourTrigger />}
      </div>
    )
  }

  // ── PAST MONTH ─────────────────────────────────────────────────────────────
  if (tipo === 'pasado') {
    const past = await fetchPastMonth(user.id, mes)
    const { topCats, movimientos } = past
    const maxCat = topCats[0]?.total ?? 1

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <DashboardBanner
          mes={mes}
          tipo="pasado"
          metricaIzq={{
            label: 'Resultado del mes',
            value: <span className={past.resultado >= 0 ? 'text-emerald-300' : 'text-red-300'}>{past.resultado >= 0 ? '+' : '-'}${fmt(Math.abs(past.resultado))}</span>,
            sub:   'Ingresos menos gastos reales',
          }}
          metricaDer={{
            label: 'Deuda tarjetas período',
            value: <span className="text-amber-300">${fmt(past.deudaTC)}</span>,
            sub:   'Consumos del período de tarjeta',
          }}
        />
        <div className="flex items-start gap-3">
          <NavArrow mes={mes} dir="prev" />
          <div className="flex-1 min-w-0 space-y-6">

        {/* KPIs */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">Resumen real del período</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Ingresos reales" value={`$${fmt(past.ingresos)}`}  sub="Acreditado en el mes" accent="emerald" />
            <KpiCard label="Gastos reales"   value={`$${fmt(past.gastos)}`}    sub="Gastado en el mes"   accent="red"     />
            <KpiCard label="Deuda tarjetas"  value={`$${fmt(past.deudaTC)}`}   sub="Período de la tarjeta" accent="amber" />
            <KpiCard
              label="Resultado neto"
              value={`${past.resultado >= 0 ? '+' : '-'}$${fmt(Math.abs(past.resultado))}`}
              sub={past.resultado >= 0 ? 'Ahorraste este mes' : 'Déficit del mes'}
              accent={past.resultado >= 0 ? 'emerald' : 'red'}
            />
          </div>
        </div>

        {/* Top categorías + Movimientos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top categorías */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Top gastos por categoría</h2>
              <p className="text-xs text-slate-400 mt-0.5">Basado en movimientos reales del mes</p>
            </div>
            {topCats.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-400">Sin movimientos en el período</p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-3">
                {topCats.map(cat => {
                  const pct = Math.round((cat.total / maxCat) * 100)
                  return (
                    <div key={cat.nombre}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700 flex items-center gap-2">
                          <span>{cat.icono}</span> {cat.nombre}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">${fmt(cat.total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent, #1a6b5a)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Movimientos del mes */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Movimientos del mes</h2>
              <Link href={`/movimientos?mes=${mes}`} className="text-xs text-blue-500 hover:text-blue-700 underline">Ver todos</Link>
            </div>
            {movimientos.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-400">Sin movimientos registrados</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                {movimientos.map((m: any) => {
                  const esIngreso = m.tipo_movimiento === 'Ingreso'
                  return (
                    <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 truncate">{m.detalle}</p>
                        <p className="text-xs text-slate-400">{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ml-3 ${esIngreso ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {esIngreso ? '+' : '-'}${fmt(m.monto)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
          </div>{/* flex-1 */}
          <NavArrow mes={mes} dir="next" />
        </div>{/* flex nav */}
      </div>
    )
  }

  // ── FUTURE MONTH ───────────────────────────────────────────────────────────
  const [future, { saldoBase: saldoMes, proyecciones }] = await Promise.all([
    fetchFutureMonth(user.id, mes),
    calcularProyecciones(user.id, mes, 4),  // 4 meses DESPUÉS del mes visto
  ])

  const ingresosProyectados = proyecciones.length > 0
    ? 0 // los ingresos del mes en sí están en future.cuotasTC con tipo Ingreso — simplificamos
    : 0
  const gastosProyectados = future.totalGF + future.totalCuotasTC

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashboardBanner
        mes={mes}
        tipo="futuro"
        metricaIzq={{
          label: 'Liquidez proyectada',
          value: <span className={saldoMes >= 0 ? 'text-emerald-300' : 'text-red-300'}>{saldoMes < 0 ? '-' : ''}${fmt(Math.abs(saldoMes))}</span>,
          sub:   'Saldo estimado al cierre del mes',
        }}
        metricaDer={{
          label: 'Gastos proyectados',
          value: <span className="text-red-300">${fmt(gastosProyectados)}</span>,
          sub:   'Fijos + cuotas de tarjeta',
        }}
      />
      <div className="flex items-start gap-3">
        <NavArrow mes={mes} dir="prev" />
        <div className="flex-1 min-w-0 space-y-6">

      {/* KPIs */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">Proyección del período</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Gastos fijos"      value={`$${fmt(future.totalGF)}`}       sub="Servicios y suscripciones" accent="red"   />
          <KpiCard label="Cuotas tarjeta"    value={`$${fmt(future.totalCuotasTC)}`} sub="Período de facturación"    accent="amber" />
          <KpiCard label="Total proyectado"  value={`$${fmt(gastosProyectados)}`}    sub="Gastos estimados del mes"  accent="slate" />
          <KpiCard
            label="Liquidez al cierre"
            value={`${saldoMes < 0 ? '-' : ''}$${fmt(Math.abs(saldoMes))}`}
            sub={saldoMes >= 0 ? 'Superávit estimado' : 'Déficit estimado'}
            accent={saldoMes >= 0 ? 'emerald' : 'red'}
          />
        </div>
      </div>

      {/* Proyecciones siguientes (desde este mes en adelante) */}
      <ProyeccionesStrip proyecciones={proyecciones} saldoBase={saldoMes} label={`Proyecciones desde ${mesLabel(mes).split(' ')[0]}`} />

      {/* Gastos fijos + Cuotas TC del período */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gastos fijos */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-50">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Gastos fijos del mes</h2>
              <p className="text-xs text-slate-400 mt-0.5">Servicios y suscripciones activos</p>
            </div>
            <Link href="/gastos-fijos" className="text-xs text-blue-500 hover:text-blue-700 underline">Ver todos</Link>
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {future.gastosFijos.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                  <p className="text-xs text-slate-400">Día {g.dia_vencimiento} · {(g.cuentas as any)?.nombre_cuenta ?? '—'}</p>
                </div>
                <p className="text-sm font-medium text-slate-800">${fmt(g.monto_estimado ?? 0)}</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/60 flex justify-between">
            <p className="text-xs text-slate-500 font-medium">Total</p>
            <p className="text-sm font-bold text-slate-800">${fmt(future.totalGF)}</p>
          </div>
        </div>

        {/* Cuotas TC */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">Cuotas de tarjeta del período</h2>
            <p className="text-xs text-slate-400 mt-0.5">Consumos ya registrados en este ciclo</p>
          </div>
          {future.cuotasTC.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-400">Sin cuotas registradas para este período</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {future.cuotasTC.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                    <p className="text-sm text-slate-700 truncate">{m.detalle}</p>
                    <p className="text-sm font-medium text-slate-800 shrink-0 ml-3">${fmt(m.monto)}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/60 flex justify-between">
                <p className="text-xs text-slate-500 font-medium">Total</p>
                <p className="text-sm font-bold text-slate-800">${fmt(future.totalCuotasTC)}</p>
              </div>
            </>
          )}
        </div>
      </div>
        </div>{/* flex-1 */}
        <NavArrow mes={mes} dir="next" />
      </div>{/* flex nav */}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
      <p className="text-5xl">🥭</p>
      <h2 className="text-xl font-semibold text-slate-800">¡Bienvenido a sinunmango!</h2>
      <p className="text-slate-500 text-sm">Todavía no tenés cuentas cargadas. Creá tu primera cuenta para ver el dashboard.</p>
      <a
        href="/onboarding"
        className="inline-block mt-2 px-6 py-3 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
      >
        Configurar mi primera cuenta →
      </a>
    </div>
  )
}
