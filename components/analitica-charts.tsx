'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

// ─── Types ────────────────────────────────────────────────────────────────────
export type MovAnalitica = {
  id: string
  fecha: string
  tipo_movimiento: string
  monto: number
  monto_estimado: number | null
  detalle: string | null
  categoria_nombre: string | null
  categoria_icono: string | null
}

type Preset = '1M' | '3M' | '6M' | '12M' | 'todo' | 'custom'

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESET_LABELS: Record<Preset, string> = {
  '1M': 'Este mes',
  '3M': '3 meses',
  '6M': '6 meses',
  '12M': '12 meses',
  'todo': 'Todo',
  'custom': 'Personalizado',
}

const COLORS = [
  '#1B3A6B', '#1a6b5a', '#d97706', '#7c3aed', '#0891b2',
  '#be185d', '#059669', '#dc2626', '#6366f1', '#f59e0b',
  '#0284c7', '#16a34a', '#9333ea', '#ea580c', '#0d9488',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtK = (n: number) => Math.abs(n) >= 1000
  ? `${(n / 1000).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`
  : fmt(n)

type StandardPreset = Exclude<Preset, 'custom'>

function getDateRange(preset: StandardPreset): { desde: Date; hasta: Date } {
  const now   = new Date()
  const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  if (preset === 'todo') return { desde: new Date(2000, 0, 1), hasta }
  const offset: Record<StandardPreset, number> = { '1M': 0, '3M': 2, '6M': 5, '12M': 11, 'todo': 0 }
  const desde = new Date(now.getFullYear(), now.getMonth() - offset[preset], 1)
  return { desde, hasta }
}

function getMeses(desde: Date, hasta: Date): string[] {
  const out: string[] = []
  let cur = new Date(desde.getFullYear(), desde.getMonth(), 1)
  const end = new Date(hasta.getFullYear(), hasta.getMonth(), 1)
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

// ─── Variación helpers ────────────────────────────────────────────────────────
function computeCatMap(movs: MovAnalitica[]): Record<string, { icono: string | null; total: number }> {
  const map: Record<string, { icono: string | null; total: number }> = {}
  movs.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
    const key = m.categoria_nombre ?? 'Sin categoría'
    if (!map[key]) map[key] = { icono: m.categoria_icono, total: 0 }
    map[key].total += m.monto_estimado ?? m.monto
  })
  return map
}

function buildVariacion(
  mapActual: Record<string, { icono: string | null; total: number }>,
  mapAnterior: Record<string, { icono: string | null; total: number }>
) {
  const todas = new Set([...Object.keys(mapActual), ...Object.keys(mapAnterior)])
  return [...todas]
    .map(cat => ({
      nombre:   cat,
      icono:    mapActual[cat]?.icono ?? mapAnterior[cat]?.icono ?? null,
      actual:   mapActual[cat]?.total ?? 0,
      anterior: mapAnterior[cat]?.total ?? 0,
      delta:    mapAnterior[cat]?.total
        ? ((mapActual[cat]?.total ?? 0) - mapAnterior[cat].total) / mapAnterior[cat].total * 100
        : null,
    }))
    .filter(r => r.actual > 0 || r.anterior > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 10)
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub: string
  color: 'emerald' | 'red' | 'amber' | 'blue'
}) {
  const s = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',     text: 'text-red-600',     dot: 'bg-red-400'     },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  }[color]
  return (
    <div className={`${s.bg} border ${s.border} rounded-2xl p-4`}>
      <div className={`w-2 h-2 rounded-full ${s.dot} mb-3`} />
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${s.text} leading-none`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
    </div>
  )
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function BarEvolucion({ data }: {
  data: { mes: string; label: string; ingresos: number; gastos: number; neto: number }[]
}) {
  const max = Math.max(...data.map(d => Math.max(d.ingresos, d.gastos)), 1)
  const BAR_H = 150

  if (data.length === 0)
    return <p className="text-center text-slate-400 text-sm py-10">Sin datos en este período</p>

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 pb-1" style={{ minWidth: data.length * 56 }}>
        {data.map(d => (
          <div key={d.mes} className="flex-1 min-w-[48px] flex flex-col items-center gap-1">
            {/* bars */}
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: BAR_H }}>
              <div className="flex-1 flex items-end">
                <div
                  className="w-full rounded-t-sm transition-all duration-500"
                  style={{
                    height: d.ingresos > 0 ? Math.max((d.ingresos / max) * BAR_H, 3) : 2,
                    background: d.ingresos > 0 ? 'var(--accent, #1a6b5a)' : '#e2e8f0',
                  }}
                  title={`Ingresos: $${fmt(d.ingresos)}`}
                />
              </div>
              <div className="flex-1 flex items-end">
                <div
                  className="w-full rounded-t-sm transition-all duration-500"
                  style={{
                    height: d.gastos > 0 ? Math.max((d.gastos / max) * BAR_H, 3) : 2,
                    background: d.gastos > 0 ? '#ef4444' : '#e2e8f0',
                  }}
                  title={`Gastos: $${fmt(d.gastos)}`}
                />
              </div>
            </div>
            {/* label */}
            <p className="text-[10px] text-slate-400 text-center whitespace-nowrap">{d.label}</p>
            {/* neto */}
            {(d.ingresos > 0 || d.gastos > 0) && (
              <p className={`text-[9px] font-medium ${d.neto >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                {d.neto >= 0 ? '+' : ''}{fmtK(d.neto)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
function Donut({ segments }: { segments: { nombre: string; icono: string | null; total: number; color: string; pct: number }[] }) {
  const SIZE = 130
  const HOLE = 66
  const R    = (SIZE - 4) / 2
  const cx   = SIZE / 2
  const cy   = SIZE / 2
  const circ = 2 * Math.PI * R

  // Build SVG arc segments using stroke-dasharray trick
  let offset = circ * 0.25 // start from top (12 o'clock = -90°)
  const arcs = segments.map(s => {
    const len = (s.pct / 100) * circ
    const arc = { color: s.color, dasharray: `${len} ${circ}`, dashoffset: -offset + circ * 0.25 }
    offset += len
    return arc
  })
  // Rotate so first segment starts at top
  // dashoffset = circumference * 0.25 means start at top

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={SIZE / 2 - HOLE / 2} />
        {segments.length === 0 ? null : arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={SIZE / 2 - HOLE / 2}
            strokeDasharray={a.dasharray}
            strokeDashoffset={a.dashoffset}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Cumulative savings line chart ────────────────────────────────────────────
function LineAcumulado({ data }: {
  data: { label: string; acumulado: number }[]
}) {
  if (data.length < 2)
    return <p className="text-center text-slate-400 text-sm py-10">Necesitás al menos 2 meses de datos</p>

  const W = 460; const H = 180
  const PL = 64; const PR = 16; const PT = 16; const PB = 32
  const cW = W - PL - PR; const cH = H - PT - PB

  const vals    = data.map(d => d.acumulado)
  const minVal  = Math.min(...vals)
  const maxVal  = Math.max(...vals)
  const pad     = (maxVal - minVal) * 0.15 || 1000
  const eMin    = minVal - pad
  const eMax    = maxVal + pad
  const range   = eMax - eMin

  const xS = (i: number) => PL + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW)
  const yS = (v: number) => PT + cH - ((v - eMin) / range) * cH
  const zeroY   = Math.min(Math.max(yS(0), PT), PT + cH)
  const showZero = zeroY > PT + 4 && zeroY < PT + cH - 4

  const lastVal  = vals[vals.length - 1]
  const isPos    = lastVal >= 0
  const lineHex  = isPos ? '#1a6b5a' : '#ef4444'
  const lineCol  = isPos ? 'var(--accent, #1a6b5a)' : '#ef4444'
  const gradId   = 'acumAreaGrad'

  const pts = data.map((d, i) => `${xS(i)},${yS(d.acumulado)}`).join(' ')
  // Standard area chart: fill from line down to the bottom of the chart
  const areaPath =
    `M${xS(0)},${PT + cH} ` +
    data.map((d, i) => `L${xS(i)},${yS(d.acumulado)}`).join(' ') +
    ` L${xS(data.length - 1)},${PT + cH} Z`

  const tickVals = [minVal, (minVal + maxVal) / 2, maxVal]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineHex} stopOpacity="0.35" />
          <stop offset="100%" stopColor={lineHex} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 0.33, 0.66, 1].map(f => (
        <line key={f} x1={PL} y1={PT + f * cH} x2={W - PR} y2={PT + f * cH}
          stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {/* Zero reference line */}
      {showZero && (
        <line x1={PL} y1={zeroY} x2={W - PR} y2={zeroY}
          stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" />
      )}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Line */}
      <polyline points={pts} fill="none" stroke={lineCol}
        strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xS(i)} cy={yS(d.acumulado)} r="4"
            fill="white" stroke={lineCol} strokeWidth="2.5" />
          {/* Value label above/below the dot */}
          <text
            x={xS(i)}
            y={yS(d.acumulado) + (i === data.findIndex(d2 => d2.acumulado === minVal) ? 14 : -7)}
            textAnchor="middle" fontSize="9" fontWeight="600" fill={lineHex}
          >
            {Math.abs(d.acumulado) >= 1000
              ? `${d.acumulado < 0 ? '-' : ''}${(Math.abs(d.acumulado)/1000).toFixed(0)}k`
              : d.acumulado.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Y axis labels */}
      {tickVals.map((v, i) => (
        <text key={i} x={PL - 6} y={yS(v) + 4}
          textAnchor="end" fontSize="9" fill="#94a3b8">
          {Math.abs(v) >= 1000
            ? `${v < 0 ? '-' : ''}${(Math.abs(v)/1000).toFixed(0)}k`
            : v.toFixed(0)}
        </text>
      ))}
      {/* Zero label on axis */}
      {showZero && (
        <text x={PL - 6} y={zeroY + 4} textAnchor="end" fontSize="9" fill="#cbd5e1">0</text>
      )}

      {/* X axis labels */}
      {data.map((d, i) => (
        <text key={i} x={xS(i)} y={H - 4}
          textAnchor="middle" fontSize="9" fill="#94a3b8">
          {d.label}
        </text>
      ))}
    </svg>
  )
}

// ─── Top gastos individuales ──────────────────────────────────────────────────
function TopGastos({ items }: {
  items: { detalle: string | null; cat: string; catIcono: string | null; monto: number }[]
}) {
  if (items.length === 0)
    return <p className="text-center text-slate-400 text-sm py-10">Sin gastos en este período</p>

  const max = items[0].monto
  return (
    <div className="space-y-3">
      {items.map((d, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="text-xs text-slate-300 w-4 text-right mt-1 shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <IconoCategoria icono={d.catIcono} size={13} />
                <span className="text-xs text-slate-400 truncate">{d.cat}</span>
              </div>
              <span className="text-sm font-semibold text-slate-800 shrink-0">${fmt(d.monto)}</span>
            </div>
            <p className="text-xs text-slate-600 font-medium truncate mb-1.5">{d.detalle || 'Sin detalle'}</p>
            <div className="w-full bg-slate-100 rounded-full h-1">
              <div className="h-1 rounded-full transition-all"
                style={{ width: `${(d.monto / max) * 100}%`, background: 'var(--accent2, #1B3A6B)' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Variación row ────────────────────────────────────────────────────────────
function VariacionRow({ r }: {
  r: { nombre: string; icono: string | null; actual: number; anterior: number; delta: number | null }
}) {
  const deltaBadge = r.delta === null ? (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-300 min-w-[52px] justify-end">
      <Minus size={11} />
    </span>
  ) : r.delta > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 min-w-[52px] justify-end">
      <TrendingUp size={11} />+{Math.round(r.delta)}%
    </span>
  ) : r.delta < 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 min-w-[52px] justify-end">
      <TrendingDown size={11} />{Math.round(r.delta)}%
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-400 min-w-[52px] justify-end">
      <Minus size={11} />0%
    </span>
  )

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <IconoCategoria icono={r.icono} size={15} />
        <span className="text-sm text-slate-700 truncate">{r.nombre}</span>
      </div>
      <span className="text-sm font-semibold text-slate-800 min-w-[90px] text-right">
        {r.actual > 0 ? `$${fmt(r.actual)}` : '—'}
      </span>
      <span className="text-sm text-slate-400 min-w-[90px] text-right">
        {r.anterior > 0 ? `$${fmt(r.anterior)}` : '—'}
      </span>
      {deltaBadge}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AnaliticaCharts({ movimientos }: { movimientos: MovAnalitica[] }) {
  const [preset, setPreset] = useState<Preset>('6M')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [variacionVista, setVariacionVista] = useState<'completa' | 'actual'>('completa')

  const { desde, hasta } = useMemo(() => {
    if (preset === 'custom' && customDesde && customHasta) {
      return {
        desde: new Date(customDesde + 'T00:00:00'),
        hasta: new Date(customHasta + 'T23:59:59'),
      }
    }
    if (preset === 'custom') return getDateRange('6M') // fallback while filling dates
    return getDateRange(preset)
  }, [preset, customDesde, customHasta])

  // Filtered movements for the selected range
  const movsFiltrados = useMemo(() =>
    movimientos.filter(m => {
      const f = new Date(m.fecha + 'T12:00:00')
      return f >= desde && f <= hasta
    }),
    [movimientos, desde, hasta]
  )

  // Monthly buckets for bar chart
  const meses = useMemo(() => getMeses(desde, hasta), [desde, hasta])

  const mensualData = useMemo(() => {
    const map: Record<string, { ingresos: number; gastos: number }> = {}
    meses.forEach(m => { map[m] = { ingresos: 0, gastos: 0 } })
    movimientos.filter(m => {
      const f = new Date(m.fecha + 'T12:00:00')
      return f >= desde && f <= hasta
    }).forEach(m => {
      const key = m.fecha.slice(0, 7)
      if (!map[key]) return
      const val = m.monto_estimado ?? m.monto
      if (m.tipo_movimiento === 'Ingreso') map[key].ingresos += val
      if (m.tipo_movimiento === 'Gasto')   map[key].gastos   += val
    })
    return meses.map(m => ({
      mes:   m,
      label: new Date(m + '-15T12:00:00')
        .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
        .replace('.', '')
        .replace(/^\w/, c => c.toUpperCase()),
      ...map[m],
      neto: map[m].ingresos - map[m].gastos,
    }))
  }, [meses, movimientos, desde, hasta])

  // KPIs
  const totalIngresos = useMemo(() =>
    movsFiltrados.filter(m => m.tipo_movimiento === 'Ingreso')
      .reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0), [movsFiltrados])
  const totalGastos = useMemo(() =>
    movsFiltrados.filter(m => m.tipo_movimiento === 'Gasto')
      .reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0), [movsFiltrados])
  const neto        = totalIngresos - totalGastos
  const savingsRate = totalIngresos > 0 ? Math.round((neto / totalIngresos) * 100) : 0
  const cntIngresos = movsFiltrados.filter(m => m.tipo_movimiento === 'Ingreso').length
  const cntGastos   = movsFiltrados.filter(m => m.tipo_movimiento === 'Gasto').length

  // Category breakdown (gastos)
  const categorias = useMemo(() => {
    const map: Record<string, { nombre: string; icono: string | null; total: number }> = {}
    movsFiltrados.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
      const key = m.categoria_nombre ?? 'Sin categoría'
      if (!map[key]) map[key] = { nombre: key, icono: m.categoria_icono, total: 0 }
      map[key].total += m.monto_estimado ?? m.monto
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [movsFiltrados])

  const donutTotal = categorias.reduce((a, c) => a + c.total, 0)
  const donutSegs  = categorias.slice(0, 10).map((c, i) => ({
    ...c,
    color: COLORS[i % COLORS.length],
    pct: donutTotal > 0 ? (c.total / donutTotal) * 100 : 0,
  }))

  // ── Dates for variación ─────────────────────────────────────────────────────
  const hoy       = new Date()
  const diaHoy    = hoy.getDate()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const dM1       = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const dM2       = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)
  const mesPrevio   = `${dM1.getFullYear()}-${String(dM1.getMonth() + 1).padStart(2, '0')}` // M-1
  const mesAnterior = `${dM2.getFullYear()}-${String(dM2.getMonth() + 1).padStart(2, '0')}` // M-2

  // Variación completa: M-2 (full) vs M-1 (full) — e.g. Feb vs Mar
  const variacionCompleta = useMemo(() => {
    const mapM2 = computeCatMap(movimientos.filter(m => m.fecha.slice(0, 7) === mesAnterior))
    const mapM1 = computeCatMap(movimientos.filter(m => m.fecha.slice(0, 7) === mesPrevio))
    return buildVariacion(mapM1, mapM2)
  }, [movimientos, mesAnterior, mesPrevio])

  // Variación actual: M-1 days 1..diaHoy vs M days 1..diaHoy (fair same-day comparison)
  const variacionActual = useMemo(() => {
    const mapM1sd = computeCatMap(movimientos.filter(m =>
      m.fecha.slice(0, 7) === mesPrevio && parseInt(m.fecha.slice(8, 10)) <= diaHoy
    ))
    const mapMsd = computeCatMap(movimientos.filter(m =>
      m.fecha.slice(0, 7) === mesActual && parseInt(m.fecha.slice(8, 10)) <= diaHoy
    ))
    return buildVariacion(mapMsd, mapM1sd)
  }, [movimientos, mesPrevio, mesActual, diaHoy])

  const mesActualLabel   = hoy.toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
  const mesPrevioLabel   = dM1.toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
  const mesAnteriorLabel = dM2.toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())

  const varData = variacionVista === 'completa' ? variacionCompleta : variacionActual

  // Cumulative savings line — skip months with no real data
  const acumuladoData = useMemo(() => {
    let running = 0
    return mensualData
      .filter(d => d.ingresos > 0 || d.gastos > 0)
      .map(d => {
        running += d.neto
        return { label: d.label, acumulado: running }
      })
  }, [mensualData])

  // Top 10 individual expenses
  const topGastosData = useMemo(() =>
    movsFiltrados
      .filter(m => m.tipo_movimiento === 'Gasto')
      .sort((a, b) => (b.monto_estimado ?? b.monto) - (a.monto_estimado ?? a.monto))
      .slice(0, 10)
      .map(m => ({
        detalle: m.detalle,
        cat: m.categoria_nombre ?? 'Sin categoría',
        catIcono: m.categoria_icono,
        monto: m.monto_estimado ?? m.monto,
      })),
    [movsFiltrados]
  )

  return (
    <div className="space-y-6">

      {/* ── Filter presets ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {(Object.keys(PRESET_LABELS) as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                preset === p
                  ? 'text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
              style={preset === p ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <input
              type="date"
              value={customDesde}
              onChange={e => setCustomDesde(e.target.value)}
              className="text-sm text-slate-700 outline-none bg-transparent"
            />
            <span className="text-slate-300 text-sm">→</span>
            <input
              type="date"
              value={customHasta}
              onChange={e => setCustomHasta(e.target.value)}
              className="text-sm text-slate-700 outline-none bg-transparent"
            />
          </div>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ingresos" value={`$${fmt(totalIngresos)}`}
          sub={`${cntIngresos} movimiento${cntIngresos !== 1 ? 's' : ''}`} color="emerald" />
        <KpiCard label="Gastos" value={`$${fmt(totalGastos)}`}
          sub={`${cntGastos} movimiento${cntGastos !== 1 ? 's' : ''}`} color="red" />
        <KpiCard
          label="Balance neto"
          value={`${neto >= 0 ? '+' : ''}$${fmt(neto)}`}
          sub="Ingresos − Gastos"
          color={neto >= 0 ? 'emerald' : 'red'}
        />
        <KpiCard
          label="Tasa de ahorro"
          value={`${savingsRate}%`}
          sub="del total ingresado"
          color={savingsRate >= 20 ? 'emerald' : savingsRate >= 0 ? 'amber' : 'red'}
        />
      </div>

      {/* ── Evolución mensual ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">Evolución mensual</p>
        <p className="text-xs text-slate-400 mb-6">Ingresos vs gastos · balance neto debajo de cada mes</p>
        <BarEvolucion data={mensualData} />
        <div className="flex items-center gap-5 mt-4 pt-4 border-t border-slate-50">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--accent, #1a6b5a)' }} /> Ingresos
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#ef4444' }} /> Gastos
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block bg-slate-200" /> Neto (etiqueta bajo cada mes)
          </span>
        </div>
      </div>

      {/* ── Categorías + Ahorro acumulado ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Category breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Gastos por categoría</p>
          <p className="text-xs text-slate-400 mb-5">Distribución en el período seleccionado</p>

          {donutTotal === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">Sin gastos en este período</p>
          ) : (
            <>
              {/* Donut + mini legend */}
              <div className="flex items-center gap-5 mb-4">
                <Donut segments={donutSegs} />
                <div className="flex-1 space-y-1.5 min-w-0">
                  {donutSegs.slice(0, 7).map(s => (
                    <div key={s.nombre} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-slate-600 truncate flex-1">{s.nombre}</span>
                      <span className="text-xs font-semibold text-slate-700 shrink-0">{s.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Full list */}
              <div className="border-t border-slate-50 pt-2">
                {donutSegs.map(s => (
                  <div key={s.nombre} className="flex items-center gap-3 py-1.5">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: s.color }} />
                    <IconoCategoria icono={s.icono} size={14} />
                    <span className="text-sm text-slate-600 flex-1 truncate">{s.nombre}</span>
                    <span className="text-sm font-semibold text-slate-800">${fmt(s.total)}</span>
                    <span className="text-xs text-slate-400 min-w-[36px] text-right">{s.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cumulative savings */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Ahorro acumulado</p>
          <p className="text-xs text-slate-400 mb-6">Saldo neto acumulado mes a mes en el período</p>
          <LineAcumulado data={acumuladoData} />
        </div>

      </div>

      {/* ── Variación de gastos (full width, with tabs) ───────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-0.5">Variación de gastos</p>
            <p className="text-xs text-slate-400">
              {variacionVista === 'completa'
                ? `${mesAnteriorLabel} completo vs ${mesPrevioLabel} completo`
                : `${mesPrevioLabel} vs ${mesActualLabel} · hasta el día ${diaHoy} de cada mes`}
            </p>
          </div>
          <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setVariacionVista('completa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                variacionVista === 'completa' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {mesAnteriorLabel} vs {mesPrevioLabel}
            </button>
            <button
              onClick={() => setVariacionVista('actual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                variacionVista === 'actual' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {mesPrevioLabel} vs {mesActualLabel} (día {diaHoy})
            </button>
          </div>
        </div>

        {varData.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-10">Sin datos suficientes para comparar</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
            {/* Left column */}
            <div>
              <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                <span className="flex-1 text-xs text-slate-400 uppercase tracking-wide">Categoría</span>
                <span className="text-xs text-slate-400 uppercase tracking-wide min-w-[90px] text-right">
                  {variacionVista === 'completa' ? mesPrevioLabel : mesActualLabel}
                </span>
                <span className="text-xs text-slate-400 uppercase tracking-wide min-w-[90px] text-right">
                  {variacionVista === 'completa' ? mesAnteriorLabel : mesPrevioLabel}
                </span>
                <span className="text-xs text-slate-400 uppercase tracking-wide min-w-[52px] text-right">Var.</span>
              </div>
              {varData.slice(0, Math.ceil(varData.length / 2)).map(r => (
                <VariacionRow key={r.nombre} r={r} />
              ))}
            </div>
            {/* Right column */}
            <div>
              <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                <span className="flex-1 text-xs text-slate-400 uppercase tracking-wide">Categoría</span>
                <span className="text-xs text-slate-400 uppercase tracking-wide min-w-[90px] text-right">
                  {variacionVista === 'completa' ? mesPrevioLabel : mesActualLabel}
                </span>
                <span className="text-xs text-slate-400 uppercase tracking-wide min-w-[90px] text-right">
                  {variacionVista === 'completa' ? mesAnteriorLabel : mesPrevioLabel}
                </span>
                <span className="text-xs text-slate-400 uppercase tracking-wide min-w-[52px] text-right">Var.</span>
              </div>
              {varData.slice(Math.ceil(varData.length / 2)).map(r => (
                <VariacionRow key={r.nombre} r={r} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Top 10 gastos individuales ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">Top 10 gastos individuales</p>
        <p className="text-xs text-slate-400 mb-5">Los movimientos de mayor monto en el período</p>
        <TopGastos items={topGastosData} />
      </div>

    </div>
  )
}
