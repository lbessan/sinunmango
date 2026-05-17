import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { TourTrigger } from '@/components/tour-trigger'
import { CargarIngresosCTA } from '@/components/cargar-ingresos-cta'
import { todayAR, todayPartsAR } from '@/lib/timezone'

type DB = SupabaseClient<Database>

// Tipos para joins de Supabase (no se infieren bien desde Database)
type CuentaJoin    = { tipo_cuenta?: string | null; nombre_cuenta?: string | null } | null
type CategoriaJoin = { nombre_categoria?: string | null; icono?: string | null } | null

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

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

// ─── Thumbnail ────────────────────────────────────────────────────────────────
function labelTipo(tipo: string): string {
  switch (tipo) {
    case 'Banco CA':  return 'Caja de Ahorro'
    case 'Banco CC':  return 'Cuenta Corriente'
    case 'Billetera': return 'Billetera virtual'
    case 'Efectivo':  return 'Efectivo'
    default:          return tipo
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
          ? <Image src={imagenUrl} alt={nombre} width={96} height={61} className="w-full h-full object-contain" />
          : <span className="text-lg">💳</span>}
      </div>
    )
  }
  const efectivoSrc = tipo === 'Efectivo' ? (moneda === 'USD' ? '/logo_dollar.png' : '/logo_peso.png') : null
  const src = imagenUrl ?? efectivoSrc
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 overflow-hidden" style={{ background: '#f1f5f9' }}>
      {src ? <Image src={src} alt={nombre} width={32} height={32} className="w-8 h-8 object-contain p-0.5 rounded-lg" /> : <span>🏦</span>}
    </div>
  )
}

// ─── Banner (full-bleed — va FUERA de cualquier max-w container) ──────────────
// Igual que conciliaciones: -mx-8 -mt-8 cancela el p-8 del <main>
function DashboardBanner({
  mes, tipo, metricaIzq, metricaDer,
}: {
  mes:  string
  tipo: 'pasado' | 'actual' | 'futuro'
  metricaIzq?: { label: string; value: React.ReactNode; sub: string }
  metricaDer?:  { label: string; value: React.ReactNode; sub: string }
}) {
  const badge    = tipo === 'actual' ? 'Mes actual' : tipo === 'pasado' ? 'Período cerrado' : 'Proyección'
  const bigLabel = mesLabel(mes).toUpperCase()

  return (
    <div
      className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6 lg:mb-8 text-white"
      style={{ background: 'linear-gradient(135deg, var(--sidebar-bg,#07192b) 0%, var(--accent2,#0b2d55) 50%, var(--accent,#0f4d3a) 100%)' }}
    >
      <div className="px-5 pt-6 pb-6 lg:px-10 lg:pt-10 lg:pb-9">
        {/* Top row: label + mes */}
        <div className="flex items-start justify-between gap-3 mb-6 lg:mb-10">
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">Resumen financiero</p>
            <p className="text-sm text-white/45">{badge}</p>
          </div>
          <h1 className="text-3xl lg:text-6xl font-black tracking-tight text-white leading-none text-right">
            {bigLabel}
          </h1>
        </div>

        {/* Métricas — solo si se pasan */}
        {metricaIzq && metricaDer && (
          <div className="grid grid-cols-2 gap-4 lg:gap-16 max-w-2xl mx-auto text-center mb-2">
            <div>
              <p className="text-xs font-semibold text-white/55 uppercase tracking-widest mb-2 lg:mb-3">{metricaIzq.label}</p>
              <div className="text-2xl lg:text-4xl font-bold text-white mb-1">{metricaIzq.value}</div>
              <p className="text-xs text-white/40 hidden sm:block">{metricaIzq.sub}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/55 uppercase tracking-widest mb-2 lg:mb-3">{metricaDer.label}</p>
              <div className="text-2xl lg:text-4xl font-bold text-white mb-1">{metricaDer.value}</div>
              <p className="text-xs text-white/40 hidden sm:block">{metricaDer.sub}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NavArrow ─────────────────────────────────────────────────────────────────
function NavArrow({ mes, dir }: { mes: string; dir: 'prev' | 'next' }) {
  const target = offsetMes(mes, dir === 'prev' ? -1 : 1)
  const label  = mesLabel(target).split(' ')[0]
  return (
    <div className="hidden lg:flex shrink-0 w-16 justify-center pt-1">
      <Link href={`/dashboard?mes=${target}`} className="flex flex-col items-center gap-2 group">
        <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-sm border border-slate-200 bg-white group-hover:shadow-md group-hover:border-slate-300 transition-all">
          {dir === 'prev'
            ? <ChevronLeft  size={26} className="text-slate-500 group-hover:text-slate-700 transition-colors" />
            : <ChevronRight size={26} className="text-slate-500 group-hover:text-slate-700 transition-colors" />
          }
        </div>
        <span className="text-xs text-slate-400 font-medium group-hover:text-slate-600 transition-colors">
          {label}
        </span>
      </Link>
    </div>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ href, label, value, valueExtra, sub, accent }: {
  href?: string; label: string; value: string; valueExtra?: string; sub: string
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
      {valueExtra && <p className={`text-xs font-semibold ${s.text} mt-1`}>{valueExtra}</p>}
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      {href && <p className="text-xs text-slate-300 mt-2 group-hover:text-slate-400 transition-colors">Ver detalle →</p>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>
}

// ─── ProyeccionesStrip ────────────────────────────────────────────────────────
function ProyeccionesStrip({ proyecciones, saldoBase, label }: {
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
            const esPos = p.proyeccion >= 0
            return (
              <Link key={p.periodo} href={`/dashboard?mes=${p.periodo.slice(0, 7)}`}
                className="bg-white rounded-xl border border-slate-100 p-3 sm:p-4 hover:border-slate-200 hover:shadow-sm transition-all group block relative overflow-hidden">
                <div className="absolute top-0 right-0 w-14 h-14 rounded-bl-full opacity-20"
                  style={{ background: esPos ? '#dcfce7' : '#fee2e2' }} />
                <p className="text-xs font-medium text-slate-500 mb-2 relative z-10">{p.label}</p>
                <p className="text-lg sm:text-xl font-bold relative z-10 tabular-nums break-words" style={{ color: esPos ? '#1a6b5a' : '#dc2626' }}>
                  {p.proyeccion < 0 ? '-' : ''}${fmt(Math.abs(p.proyeccion))}
                </p>
                {/* Antes era flex+gap-1: el span "vs anterior" wrappeaba a una
                    línea separada cuando el monto era largo, dejando "vs
                    anterior" huérfano. Como párrafo único el texto fluye
                    natural — wrap inline limpio con espacio entre tokens. */}
                <p className="mt-1 text-xs relative z-10">
                  <span className={`font-medium tabular-nums ${p.diferencia >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {p.diferencia >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p.diferencia))}
                  </span>
                  {' '}
                  <span className="text-slate-400">vs anterior</span>
                </p>
                <div className="mt-2 space-y-0.5 relative z-10">
                  {p.ingresos > 0 && <p className="text-xs text-slate-400 tabular-nums">+${fmt(p.ingresos)} ingresos</p>}
                  <p className="text-xs text-slate-400 tabular-nums">-${fmt(p.gastos_fijos + p.gastos_tarjeta)} gastos</p>
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

// ─── Tipos / calcularProyecciones ─────────────────────────────────────────────
type ProyeccionMes = {
  periodo: string; label: string
  ingresos: number; gastos_fijos: number; gastos_tarjeta: number
  proyeccion: number; diferencia: number
}

async function calcularProyecciones(supabase: DB, userId: string, desde: string, meses = 4) {
  const { year: cyAR, month: cmAR } = todayPartsAR()
  const today  = new Date(cyAR, cmAR - 1, 1)
  const curMes = `${cyAR}-${String(cmAR).padStart(2, '0')}`
  const [{ data: resumen }, { data: gastosFijosRaw }, { data: tarjetasRaw }, { data: params }] =
    await Promise.all([
      supabase.from('dashboard_resumen').select('*').eq('user_id', userId).single(),
      supabase.from('gastos_fijos').select('*, cuentas(tipo_cuenta)').eq('activo', true).eq('user_id', userId),
      supabase.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('activa', true).eq('user_id', userId),
      supabase.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', userId).single(),
    ])
  if (!resumen) return {
    saldoBase: 0, startSaldo: 0, saldoInicioMes: 0,
    datosDelMes: { totalIng: 0, gastosFijosEfectivo: 0, gastosFijosTarjeta: 0, totalTC: 0 },
    proyecciones: [] as ProyeccionMes[],
  }
  const dolar       = params?.valor ?? 1410
  const tarjetaIds  = new Set((tarjetasRaw ?? []).map(t => t.id))
  const deudaRest   = Math.max(0, (resumen.deuda_tarjetas_periodo ?? 0) - (resumen.pagos_tarjeta_mes ?? 0))
  const startSaldo  = (resumen.disponible_real ?? 0) + (resumen.ingresos_futuros_mes ?? 0) - (resumen.gastos_fijos_pendientes ?? 0) - deudaRest
  const gastosFijosEfectivo = (gastosFijosRaw ?? [])
    .filter(g => (g.cuentas as CuentaJoin)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((a, g) => a + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado), 0)
  const gastosFijosTarjeta = (gastosFijosRaw ?? [])
    .filter(g => (g.cuentas as CuentaJoin)?.tipo_cuenta === 'Tarjeta Credito')
    .reduce((a, g) => a + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado), 0)
  const [cy, cm]  = curMes.split('-').map(Number)
  const [dy, dm]  = desde.split('-').map(Number)
  const skipCount = (dy - cy) * 12 + (dm - cm)
  const totalLoop = skipCount + meses
  let saldo = Math.round(startSaldo)
  let saldoBase    = saldo
  // saldoInicioMes = saldo justo ANTES de procesar el mes que se está mostrando
  // Para skipCount=1 (Junio): captura startSaldo (antes de i=1)
  // Para skipCount=2 (Julio): captura saldo después de Junio (antes de i=2)
  let saldoInicioMes = Math.round(startSaldo)
  // Valores exactos usados en el cálculo del mes mostrado (para que la fórmula cierre)
  let datosDelMes = { totalIng: 0, gastosFijosEfectivo: Math.round(gastosFijosEfectivo), gastosFijosTarjeta: Math.round(gastosFijosTarjeta), totalTC: 0 }
  const proyecciones: ProyeccionMes[] = []
  for (let i = 1; i <= totalLoop; i++) {
    // Capturar el saldo ANTES de procesar este mes (= inicio del mes i)
    if (i === skipCount) saldoInicioMes = saldo

    const fecha   = new Date(cy, cm - 1 + i, 1)
    const periodo = fecha.toISOString().slice(0, 10)
    const [{ data: ingresos }, { data: gastosTC }] = await Promise.all([
      supabase.from('movimientos').select('monto, moneda')
        .eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', periodo).eq('user_id', userId),
      supabase.from('movimientos').select('monto, moneda, cuenta_origen')
        .eq('tipo_movimiento', 'Gasto').eq('periodo_tarjeta', periodo).eq('user_id', userId),
    ])
    const totalIng = (ingresos ?? []).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    const totalTC  = (gastosTC ?? []).filter(m => m.cuenta_origen != null && tarjetaIds.has(m.cuenta_origen)).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    saldo = Math.round(saldo + totalIng - gastosFijosEfectivo - gastosFijosTarjeta - totalTC)
    if (i === skipCount) {
      saldoBase = saldo
      // Capturar exactamente lo que se usó para este mes
      datosDelMes = {
        totalIng:            Math.round(totalIng),
        gastosFijosEfectivo: Math.round(gastosFijosEfectivo),
        gastosFijosTarjeta:  Math.round(gastosFijosTarjeta),
        totalTC:             Math.round(totalTC),
      }
    }
    if (i > skipCount) {
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
  return { saldoBase, startSaldo: Math.round(startSaldo), saldoInicioMes, datosDelMes, proyecciones }
}

// ─── Past month data ──────────────────────────────────────────────────────────
async function fetchPastMonth(supabase: DB, userId: string, mes: string) {
  const start = `${mes}-01`
  const end   = `${offsetMes(mes, 1)}-01`

  const [{ data: movs }, { data: tcuentas }, { data: resumen }, { data: postMovs }] = await Promise.all([
    // Movimientos del mes — usamos la VISTA para tener monto_estimado (USD→ARS convertido)
    supabase.from('movimientos_completos')
      .select('id, monto, monto_estimado, moneda, tipo_movimiento, cuenta_origen, cuenta_destino, periodo_tarjeta, categoria_nombre, categoria_icono')
      .eq('user_id', userId).gte('fecha', start).lt('fecha', end),
    // IDs de tarjetas (para filtrar gastos de tarjeta)
    supabase.from('cuentas').select('id')
      .eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', userId),
    // Balance actual (para reverse-calcular el saldo al fin del mes)
    supabase.from('dashboard_resumen').select('disponible_real').eq('user_id', userId).single(),
    // Movimientos posteriores al mes (para restar del saldo actual y llegar al fin del mes)
    // Usamos la vista para tener monto_estimado coherente con la fórmula del mes
    supabase.from('movimientos_completos')
      .select('monto, monto_estimado, tipo_movimiento, cuenta_origen, cuenta_destino')
      .eq('user_id', userId).gte('fecha', end)
      .lte('fecha', todayAR()),
  ])

  const tarjetaIds = new Set((tcuentas ?? []).map(t => t.id))
  const isTarjeta  = (cuentaId: string | null | undefined) => !!cuentaId && tarjetaIds.has(cuentaId)
  const all = movs ?? []
  // Helper: monto_estimado convierte USD→ARS según cotización; si está null usamos monto
  const monto = (m: { monto: number | null; monto_estimado: number | null }) =>
    m.monto_estimado ?? m.monto ?? 0

  // ── Totales del mes (CASH FLOW REAL, convertido a ARS) ──
  // Para que la fórmula cierre con postNet, ingresos y gastos filtran por
  // cuenta_origen no-tarjeta (un "Ingreso" con origen tarjeta es un refund,
  // no entra cash). Pagos a tarjeta cuentan igual aunque origen sea otra
  // cuenta cash (origen siempre no-tarjeta para un pago).
  const ingresos = all
    .filter(m => m.tipo_movimiento === 'Ingreso' && !isTarjeta(m.cuenta_origen))
    .reduce((s, m) => s + monto(m), 0)

  const gastosCash = all
    .filter(m => m.tipo_movimiento === 'Gasto' && !isTarjeta(m.cuenta_origen))
    .reduce((s, m) => s + monto(m), 0)

  const pagosTarjeta = all
    .filter(m => m.tipo_movimiento === 'Transferencia'
              && !isTarjeta(m.cuenta_origen)
              && isTarjeta(m.cuenta_destino))
    .reduce((s, m) => s + monto(m), 0)

  const gastos    = gastosCash + pagosTarjeta
  const resultado = Math.round(ingresos - gastos)

  // ── Saldo fin del mes (reverse-calcular del actual hacia atrás) ──
  // Mismas reglas + mismo monto_estimado para que saldoFinMes == saldoInicioMesSiguiente
  const disponibleHoy = resumen?.disponible_real ?? 0
  const postNet = (postMovs ?? [])
    .filter(m => !isTarjeta(m.cuenta_origen))
    .reduce((s, m) => {
      const v = monto(m)
      if (m.tipo_movimiento === 'Ingreso') return s + v
      if (m.tipo_movimiento === 'Gasto')   return s - v
      if (m.tipo_movimiento === 'Transferencia' && isTarjeta(m.cuenta_destino)) return s - v
      return s
    }, 0)
  const saldoFinMes    = Math.round(disponibleHoy - postNet)
  const saldoInicioMes = saldoFinMes - resultado

  // ── Top categorías (vista de CONSUMO — incluye tarjeta) ──
  const catMap: Record<string, { nombre: string; icono: string | null; total: number }> = {}
  for (const m of all.filter(m => m.tipo_movimiento === 'Gasto')) {
    const key = m.categoria_nombre ?? 'Sin categoría'
    if (!catMap[key]) catMap[key] = { nombre: key, icono: m.categoria_icono, total: 0 }
    catMap[key].total += monto(m)
  }
  const topCats = Object.values(catMap).sort((a, b) => b.total - a.total).slice(0, 5)

  return {
    ingresos:     Math.round(ingresos),
    gastos:       Math.round(gastos),
    gastosCash:   Math.round(gastosCash),
    pagosTarjeta: Math.round(pagosTarjeta),
    resultado,
    saldoFinMes,
    saldoInicioMes,
    topCats,
  }
}

// ─── Future month data ────────────────────────────────────────────────────────
async function fetchFutureMonth(supabase: DB, userId: string, mes: string) {
  const mesStart = `${mes}-01`
  const [{ data: cuotasRaw }, { data: gastosFijos }, { data: tcuentas }, { data: ingresosRaw }, { data: params }] = await Promise.all([
    supabase.from('movimientos')
      .select('id, detalle, monto, moneda, cuenta_origen, cuentas(nombre_cuenta, imagen_url, color_primario)')
      .eq('user_id', userId).eq('tipo_movimiento', 'Gasto').eq('periodo_tarjeta', mesStart),
    supabase.from('gastos_fijos')
      .select('*, cuentas(nombre_cuenta, tipo_cuenta)')
      .eq('activo', true).eq('user_id', userId).order('dia_vencimiento'),
    supabase.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', userId),
    supabase.from('movimientos')
      .select('monto, moneda')
      .eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', mesStart).eq('user_id', userId),
    supabase.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', userId).single(),
  ])
  // Misma conversión USD que calcularProyecciones para que la fórmula cierre
  const dolar         = params?.valor ?? 1410
  const tarjetaIds    = new Set((tcuentas ?? []).map(t => t.id))
  const cuotasTC      = (cuotasRaw ?? []).filter(m => tarjetaIds.has(m.cuenta_origen ?? ''))
  const totalCuotasTC = cuotasTC.reduce((s, m) => s + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)

  // Separar gastos fijos: efectivo/banco vs tarjeta de crédito (con conversión USD)
  const gfEfectivo        = (gastosFijos ?? []).filter(g => (g.cuentas as CuentaJoin)?.tipo_cuenta !== 'Tarjeta Credito')
  const gfTarjeta         = (gastosFijos ?? []).filter(g => (g.cuentas as CuentaJoin)?.tipo_cuenta === 'Tarjeta Credito')
  const totalGF_efectivo  = gfEfectivo.reduce((s, g) => s + (g.moneda === 'USD' ? (g.monto_estimado ?? 0) * dolar : (g.monto_estimado ?? 0)), 0)
  const totalGF_tarjeta   = gfTarjeta.reduce((s, g) => s + (g.moneda === 'USD' ? (g.monto_estimado ?? 0) * dolar : (g.monto_estimado ?? 0)), 0)
  // Total pago tarjetas = cuotas ya registradas + gastos fijos recurrentes de tarjeta
  const totalPagoTarjetas = totalCuotasTC + totalGF_tarjeta

  const totalIngresos = (ingresosRaw ?? []).reduce((s, m) => s + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
  return {
    cuotasTC,
    totalCuotasTC:     Math.round(totalCuotasTC),
    gfEfectivo,
    gfTarjeta,
    totalGF_efectivo:  Math.round(totalGF_efectivo),
    totalGF_tarjeta:   Math.round(totalGF_tarjeta),
    totalPagoTarjetas: Math.round(totalPagoTarjetas),
    totalIngresos:     Math.round(totalIngresos),
    dolar,
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; mes?: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')
  const params   = await searchParams
  const { year: yAR, month: mAR, day: dAR } = todayPartsAR()
  const today    = new Date(yAR, mAR - 1, dAR)
  const todayDay = dAR
  const cur      = `${yAR}-${String(mAR).padStart(2, '0')}`
  const mes      = parseMes(params.mes, today)
  const tipo     = mes < cur ? 'pasado' : mes > cur ? 'futuro' : 'actual'

  // ── CURRENT MONTH ──────────────────────────────────────────────────────────
  if (tipo === 'actual') {
    const inicioMesCur = `${cur}-01`
    const [{ data: resumen }, { data: cuentas }, { data: gastosFijos }, { data: cuentasExtra },
      { data: categoriasIng }, { data: deudaTarjMovs },
      { saldoBase: proyectadoActual, proyecciones }] = await Promise.all([
      supabase.from('dashboard_resumen').select('*').eq('user_id', user.id).single(),
      supabase.from('saldo_actual_cuentas').select('*').eq('activa', true).eq('user_id', user.id),
      supabase.from('gastos_fijos').select('*, cuentas(nombre_cuenta, tipo_cuenta)').eq('activo', true).eq('user_id', user.id).order('dia_vencimiento'),
      supabase.from('cuentas').select('id, imagen_url, color_primario').eq('user_id', user.id),
      supabase.from('categorias').select('id, nombre_categoria, icono, tipo_default').eq('user_id', user.id),
      // Movs del período actual sobre tarjetas — para desglose ARS/USD nativo en el card
      supabase.from('movimientos_completos')
        .select('monto, moneda, tipo_movimiento, cuenta_origen_tipo')
        .in('tipo_movimiento', ['Gasto', 'Ingreso'])
        .eq('periodo_tarjeta', inicioMesCur)
        .eq('cuenta_origen_tipo', 'Tarjeta Credito')
        .eq('user_id', user.id),
      calcularProyecciones(supabase, user.id, cur, 4),
    ])
    if (!resumen) return <EmptyState />

    // Desglose nativo de la deuda del período (Ingresos restan, igual que /resumen?tipo=tarjetas)
    let deudaArs = 0, deudaUsd = 0
    for (const m of deudaTarjMovs ?? []) {
      const signo = m.tipo_movimiento === 'Ingreso' ? -1 : 1
      const raw   = (Number(m.monto) || 0) * signo
      if (m.moneda === 'USD') deudaUsd += raw
      else                    deudaArs += raw
    }
    const extraMap = Object.fromEntries((cuentasExtra ?? []).map(c => [c.id, c]))
    const gastosFijosProximos = (gastosFijos ?? [])
      .filter(g => (g.dia_vencimiento ?? 0) >= todayDay)
      .sort((a, b) => (a.dia_vencimiento ?? 0) - (b.dia_vencimiento ?? 0))
    const cuentasEfectivo = (cuentas ?? []).filter(c => c.tipo_cuenta !== 'Tarjeta Credito')
    const tarjetas        = (cuentas ?? []).filter(c => c.tipo_cuenta === 'Tarjeta Credito')

    return (
      <>
        {/* Banner full-bleed: fuera del max-w, -mx-8 -mt-8 cancela el p-8 del <main> */}
        <DashboardBanner
          mes={mes} tipo="actual"
          metricaIzq={{ label: 'Saldo disponible', value: `$${fmt(resumen.disponible_real ?? 0)}`, sub: 'Suma de billeteras y efectivo ARS' }}
          metricaDer={{
            label: 'Proyectado fin de mes',
            value: <span className={proyectadoActual >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {proyectadoActual < 0 ? '-' : ''}${fmt(Math.abs(proyectadoActual))}
            </span>,
            sub: 'Liquidez estimada',
          }}
        />

        {/* Contenido con max-w */}
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Nav de mes — mobile: flechas compactas en línea */}
          <div className="flex items-center justify-between lg:hidden">
            <Link href={`/dashboard?mes=${offsetMes(mes, -1)}`}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl border border-slate-200 bg-white transition-all">
              <ChevronLeft size={16} />
              <span>{mesLabel(offsetMes(mes, -1)).split(' ')[0]}</span>
            </Link>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{mesLabel(mes)}</span>
            <Link href={`/dashboard?mes=${offsetMes(mes, 1)}`}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl border border-slate-200 bg-white transition-all">
              <span>{mesLabel(offsetMes(mes, 1)).split(' ')[0]}</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="flex items-start gap-3">
            <NavArrow mes={mes} dir="prev" />
            <div className="flex-1 min-w-0 space-y-6">

              {/* KPIs */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">Indicadores del mes</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard href="/resumen?tipo=ingresos"   label="Ingresos actuales" value={`$${fmt(resumen.ingresos_actuales ?? 0)}`}      sub="Cobrados este mes"   accent="emerald" />
                  <KpiCard href="/resumen?tipo=gastos"     label="Gastos del mes"    value={`$${fmt(resumen.gastos_actuales ?? 0)}`}        sub="Cash + pagos a tarjetas"   accent="red"     />
                  <KpiCard href="/resumen?tipo=tarjetas"   label="Deuda tarjetas"    value={`$${fmt(deudaArs)}`} valueExtra={deudaUsd > 0 ? `+ U$S ${fmt(deudaUsd)}` : undefined} sub="Período actual"      accent="amber"   />
                  <KpiCard href="/resumen?tipo=proyectado" label="Proyectado EOM"
                    value={`${proyectadoActual < 0 ? '-' : ''}$${fmt(Math.abs(proyectadoActual))}`}
                    sub="Liquidez estimada" accent={proyectadoActual >= 0 ? 'emerald' : 'red'} />
                </div>
              </div>

              {/* Proyecciones */}
              <ProyeccionesStrip proyecciones={proyecciones} saldoBase={proyectadoActual} label="Proyecciones Mensuales" />

              {/* CTA: cargar ingresos a futuro para mejorar la precisión de Proyecciones */}
              <CargarIngresosCTA
                cuentas={(cuentas ?? [])
                  .filter((c): c is typeof c & { id: string } => c.id != null)
                  .map(c => ({ id: c.id, nombre_cuenta: c.nombre_cuenta, tipo_cuenta: c.tipo_cuenta }))}
                categorias={categoriasIng ?? []}
              />

              {/* Cuentas + Gastos fijos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50">
                    <h2 className="text-sm font-semibold text-slate-700">Estado de cuentas</h2>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {cuentasEfectivo.map(c => {
                      if (!c.id || !c.tipo_cuenta || !c.nombre_cuenta) return null
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
                      if (!c.id || !c.tipo_cuenta || !c.nombre_cuenta) return null
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
                        const esTarjeta = (g.cuentas as CuentaJoin)?.tipo_cuenta === 'Tarjeta Credito'
                        const hoy       = g.dia_vencimiento === todayDay
                        const diasResta = (g.dia_vencimiento ?? 0) - todayDay
                        return (
                          <div key={g.id} className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${hoy ? 'bg-red-400 animate-pulse' : diasResta <= 3 ? 'bg-amber-400' : esTarjeta ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                              <div>
                                <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                                <p className="text-xs text-slate-400">Día {g.dia_vencimiento} · {(g.cuentas as CuentaJoin)?.nombre_cuenta ?? '—'}</p>
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

            </div>
            <NavArrow mes={mes} dir="next" />
          </div>
        </div>
        {params.tour === '1' && <TourTrigger />}
      </>
    )
  }

  // ── PAST MONTH ─────────────────────────────────────────────────────────────
  if (tipo === 'pasado') {
    const past   = await fetchPastMonth(supabase, user.id, mes)
    const maxCat = past.topCats[0]?.total ?? 1

    return (
      <>
        <DashboardBanner mes={mes} tipo="pasado" />

        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-start gap-3">
            <NavArrow mes={mes} dir="prev" />
            <div className="flex-1 min-w-0 space-y-6">

              {/* ── Fila 1: Ingresos · Gastos · Ahorro del mes ── */}
              {/* En mobile (360-640px) 3 columnas de ~110px con montos AR de
                  7-8 dígitos se desbordan. Colapsamos a 1 columna debajo de
                  sm. tabular-nums alinea los dígitos verticalmente. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 sm:p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Ingresos del mes</p>
                  <p className="text-2xl font-bold leading-none text-emerald-700 tabular-nums">${fmt(past.ingresos)}</p>
                  <p className="text-xs text-slate-400 mt-1.5">Acreditado en el mes</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 sm:p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Gastos del mes</p>
                  <p className="text-2xl font-bold leading-none text-red-700 tabular-nums">${fmt(past.gastos)}</p>
                  <p className="text-xs text-slate-400 mt-1.5" title="Cash flow: gastos efectivo/banco + pagos a tarjeta">
                    ${fmt(past.gastosCash)} cash {past.pagosTarjeta > 0 && `+ $${fmt(past.pagosTarjeta)} a tarjetas`}
                  </p>
                </div>
                <div className={`rounded-2xl border p-4 sm:p-5 ${past.resultado >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Ahorro del mes</p>
                  <p className={`text-2xl font-bold leading-none tabular-nums ${past.resultado >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    {past.resultado >= 0 ? '+' : '-'}${fmt(Math.abs(past.resultado))}
                  </p>
                  <p className="text-xs text-slate-400 mt-1.5">Ingresos − Gastos</p>
                </div>
              </div>

              {/* ── Fila 2: Empezó con · Terminó con (grandes) ── */}
              {/* text-3xl en 360px ≈ 30px → 8 dígitos (~$1.234.567) entran
                  apenas. Bajamos a text-2xl mobile (24px) que da margen y
                  mantiene jerarquía visual frente a la fila 1. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Empezó el mes con</p>
                  <p className={`text-2xl sm:text-3xl lg:text-4xl font-black leading-none tabular-nums ${past.saldoInicioMes >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                    {past.saldoInicioMes < 0 ? '-' : ''}${fmt(Math.abs(past.saldoInicioMes))}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Saldo disponible al 1º del mes</p>
                </div>
                <div className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${past.saldoFinMes >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Terminó el mes con</p>
                  <p className={`text-2xl sm:text-3xl lg:text-4xl font-black leading-none tabular-nums ${past.saldoFinMes >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {past.saldoFinMes < 0 ? '-' : ''}${fmt(Math.abs(past.saldoFinMes))}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Pasa al mes siguiente</p>
                </div>
              </div>

              {/* ── Top categorías de consumo (incluye tarjeta) ── */}
              {past.topCats.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50">
                    <h2 className="text-sm font-semibold text-slate-700">Top categorías de consumo</h2>
                    <p className="text-xs text-slate-400 mt-0.5">En qué consumiste este mes (incluye consumos con tarjeta — distinto del cash flow de arriba)</p>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    {past.topCats.map(cat => {
                      const pct = Math.round((cat.total / maxCat) * 100)
                      return (
                        <div key={cat.nombre}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-700 flex items-center gap-2">
                              <IconoCategoria icono={cat.icono} size={18} />
                              {cat.nombre}
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
                </div>
              )}

            </div>
            <NavArrow mes={mes} dir="next" />
          </div>
        </div>
      </>
    )
  }

  // ── FUTURE MONTH ───────────────────────────────────────────────────────────
  const [future, { saldoBase: saldoMes, saldoInicioMes: saldoInicio, datosDelMes, proyecciones }] = await Promise.all([
    fetchFutureMonth(supabase, user.id, mes),
    calcularProyecciones(supabase, user.id, mes, 4),
  ])

  return (
    <>
      <DashboardBanner mes={mes} tipo="futuro" />

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <NavArrow mes={mes} dir="prev" />
          <div className="flex-1 min-w-0 space-y-6">

            {/* Liquidez estimada — el text-5xl original (48px) desborda en
                mobile con montos de 8 dígitos. Bajamos a text-3xl mobile y
                escalamos progresivamente. tabular-nums + min-w-0 evitan
                que el padre flex empuje el container hacia overflow. */}
            <div className={`rounded-2xl border p-5 sm:p-7 ${saldoMes >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Liquidez estimada al cierre de {mesLabel(mes)}
              </p>
              <p className={`text-3xl sm:text-4xl lg:text-5xl font-black leading-none tabular-nums ${saldoMes >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {saldoMes < 0 ? '-' : ''}${fmt(Math.abs(saldoMes))}
              </p>
            </div>

            {/* Fórmula */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Proyección del período</p>
              </div>
              {[
                { label: 'Saldo proyectado inicio del mes',  value: saldoInicio,                                                    color: 'var(--accent, #1a6b5a)', signo: ''  },
                { label: 'Ingresos cargados',                value: datosDelMes.totalIng,                                            color: 'var(--accent, #1a6b5a)', signo: '+' },
                { label: 'Gastos fijos en efectivo / banco', value: datosDelMes.gastosFijosEfectivo,                                  color: '#dc2626',                signo: '-' },
                { label: 'Pago tarjetas estimado',           value: datosDelMes.gastosFijosTarjeta + datosDelMes.totalTC,             color: '#d97706',                signo: '-' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0">
                  <p className="text-sm text-slate-600">{row.label}</p>
                  <p className="text-sm font-semibold" style={{ color: row.color }}>
                    {row.signo ? `${row.signo} ` : ''}${fmt(Math.abs(row.value))}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Liquidez estimada</p>
                <p className="text-lg font-bold" style={{ color: saldoMes >= 0 ? '#1a6b5a' : '#dc2626' }}>
                  = {saldoMes < 0 ? '-' : ''}${fmt(Math.abs(saldoMes))}
                </p>
              </div>
            </div>

            {/* Proyecciones siguientes */}
            <ProyeccionesStrip proyecciones={proyecciones} saldoBase={saldoMes}
              label={`Proyecciones desde ${mesLabel(mes).split(' ')[0]}`} />

            {/* Gastos fijos efectivo + Pago tarjetas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Gastos fijos en efectivo/banco */}
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between border-b border-slate-50">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">Gastos fijos efectivo / banco</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Pagados directamente (no tarjeta)</p>
                  </div>
                  <Link href="/gastos-fijos" className="text-xs text-blue-500 hover:text-blue-700 underline">Ver todos</Link>
                </div>
                {future.gfEfectivo.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-slate-400">Sin gastos fijos en efectivo</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                    {future.gfEfectivo.map(g => (
                      <div key={g.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                          <p className="text-xs text-slate-400">Día {g.dia_vencimiento} · {(g.cuentas as CuentaJoin)?.nombre_cuenta ?? '—'}</p>
                        </div>
                        <p className="text-sm font-medium text-slate-800">${fmt(g.monto_estimado ?? 0)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/60 flex justify-between">
                  <p className="text-xs text-slate-500 font-medium">Total efectivo</p>
                  <p className="text-sm font-bold text-red-700">${fmt(future.totalGF_efectivo)}</p>
                </div>
              </div>

              {/* Pago tarjetas: gastos fijos tarjeta + cuotas registradas */}
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-50">
                  <h2 className="text-sm font-semibold text-slate-700">Pago tarjetas estimado</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Gastos fijos de tarjeta + cuotas registradas</p>
                </div>

                {/* Gastos fijos de tarjeta */}
                {future.gfTarjeta.length > 0 && (
                  <>
                    <div className="px-5 py-2 bg-slate-50/70 border-b border-slate-100">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Gastos fijos recurrentes</p>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {future.gfTarjeta.map(g => (
                        <div key={g.id} className="flex items-center justify-between px-5 py-2.5">
                          <div>
                            <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                            <p className="text-xs text-slate-400">{(g.cuentas as CuentaJoin)?.nombre_cuenta ?? '—'}</p>
                          </div>
                          <p className="text-sm font-medium text-slate-800">${fmt(g.monto_estimado ?? 0)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-2 border-b border-slate-100 flex justify-between bg-slate-50/40">
                      <p className="text-xs text-slate-400">Subtotal fijos</p>
                      <p className="text-xs font-semibold text-amber-700">${fmt(future.totalGF_tarjeta)}</p>
                    </div>
                  </>
                )}

                {/* Cuotas registradas */}
                <div className="px-5 py-2 bg-slate-50/70 border-b border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Cuotas registradas</p>
                </div>
                {future.cuotasTC.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm text-slate-400">Sin cuotas registradas para este período</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 max-h-52 overflow-y-auto">
                    {future.cuotasTC.map(m => (
                      <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                        <p className="text-sm text-slate-700 truncate">{m.detalle}</p>
                        <p className="text-sm font-medium text-slate-800 shrink-0 ml-3">${fmt(m.monto)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/60 flex justify-between">
                  <p className="text-xs text-slate-500 font-medium">Total pago tarjetas</p>
                  <p className="text-sm font-bold text-amber-700">${fmt(future.totalPagoTarjetas)}</p>
                </div>
              </div>

            </div>

          </div>
          <NavArrow mes={mes} dir="next" />
        </div>
      </div>
    </>
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
