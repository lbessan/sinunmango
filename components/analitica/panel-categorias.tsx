'use client'

// ─── Panel de gastos por categoría ───────────────────────────────────────────
//
// Donut INTERACTIVO + lista clickeable con drill-down inline.
//
//   - Hover en un segmento del donut → se "destaca" + muestra info en el centro
//   - Hover en un item de la lista → resalta el segmento del donut
//   - Click en un item → expande inline (subcategorías + top movs + sparkline)

import { useState, useMemo } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { Sparkline } from './sparkline'
import {
  fmt, fmtK, formatFechaCorta, montoOf, parseFecha, pctDelta,
  type MovAnalitica, type Subcategoria,
} from './utils'
import { agruparCompras } from './agrupar-compras'
import { Layers } from 'lucide-react'

const PALETA = [
  '#1B3A6B', '#1a6b5a', '#d97706', '#7c3aed', '#0891b2',
  '#be185d', '#059669', '#dc2626', '#6366f1', '#f59e0b',
  '#0284c7', '#16a34a', '#9333ea', '#ea580c', '#0d9488',
]

type CategoriaAgrupada = {
  nombre:        string
  icono:         string | null
  total:         number
  count:         number
  pct:           number
  color:         string
  movs:          MovAnalitica[]
  totalAnterior: number
  deltaPct:      number | null
  mensual:       number[]
}

export function PanelCategorias({
  movs,
  movsTodos,
  desde,
  hasta,
  subcategorias,
}: {
  movs:          MovAnalitica[]
  movsTodos:     MovAnalitica[]
  desde:         Date
  hasta:         Date
  subcategorias: Subcategoria[]
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hovered, setHovered]   = useState<string | null>(null)

  const data = useMemo<CategoriaAgrupada[]>(() => {
    const map: Record<string, { icono: string | null; total: number; count: number; movs: MovAnalitica[] }> = {}
    movs.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
      const k = m.categoria_nombre ?? 'Sin categoría'
      if (!map[k]) map[k] = { icono: m.categoria_icono, total: 0, count: 0, movs: [] }
      map[k].total += montoOf(m)
      map[k].count++
      map[k].movs.push(m)
    })
    const total = Object.values(map).reduce((a, v) => a + v.total, 0)

    // Período anterior del mismo tamaño
    const periodoDuracion = hasta.getTime() - desde.getTime()
    const antHasta = new Date(desde.getTime() - 86_400_000)
    const antDesde = new Date(antHasta.getTime() - periodoDuracion)
    const totalAntPorCat: Record<string, number> = {}
    movsTodos.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
      const f = parseFecha(m.fecha)
      if (f < antDesde || f > antHasta) return
      const k = m.categoria_nombre ?? 'Sin categoría'
      totalAntPorCat[k] = (totalAntPorCat[k] ?? 0) + montoOf(m)
    })

    // Evolución mensual últimos 6 meses
    const hoy = new Date()
    const sparkInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1)
    const mensualPorCat: Record<string, number[]> = {}
    for (const cat of Object.keys(map)) {
      mensualPorCat[cat] = Array(6).fill(0)
    }
    for (let i = 0; i < 6; i++) {
      const mY = sparkInicio.getFullYear()
      const mM = sparkInicio.getMonth() + i
      const mesStart = new Date(mY, mM, 1)
      const mesEnd   = new Date(mY, mM + 1, 0)
      movsTodos.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
        const f = parseFecha(m.fecha)
        if (f < mesStart || f > mesEnd) return
        const k = m.categoria_nombre ?? 'Sin categoría'
        if (!mensualPorCat[k]) mensualPorCat[k] = Array(6).fill(0)
        mensualPorCat[k][i] += montoOf(m)
      })
    }

    return Object.entries(map)
      .map(([nombre, v], i) => ({
        nombre,
        icono:         v.icono,
        total:         v.total,
        count:         v.count,
        pct:           total > 0 ? (v.total / total) * 100 : 0,
        color:         PALETA[i % PALETA.length],
        movs:          v.movs,
        totalAnterior: totalAntPorCat[nombre] ?? 0,
        deltaPct:      pctDelta(v.total, totalAntPorCat[nombre] ?? 0),
        mensual:       mensualPorCat[nombre] ?? Array(6).fill(0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [movs, movsTodos, desde, hasta])

  // Reasignar colores en orden de monto (top cat = primer color)
  const dataConColores = data.map((d, i) => ({ ...d, color: PALETA[i % PALETA.length] }))
  const totalGeneral   = dataConColores.reduce((a, c) => a + c.total, 0)
  const hoveredCat     = hovered ? dataConColores.find(c => c.nombre === hovered) ?? null : null

  if (totalGeneral === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-1">Gastos por categoría</p>
        <p className="text-xs text-slate-400 py-6 text-center">Sin gastos en este período</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-700">Gastos por categoría</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {dataConColores.length} categorías · pasá el mouse sobre el donut o hacé click en una categoría para ver detalle
        </p>
      </div>

      {/* Donut + top 6 leyenda */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8 mb-6 pb-6 border-b border-slate-100">
        <DonutInteractivo
          segments={dataConColores}
          hoveredCat={hovered}
          onHover={setHovered}
          totalGeneral={totalGeneral}
          dataLength={dataConColores.length}
        />
        <div className="flex-1 w-full min-w-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Top 6 categorías</p>
          <div className="space-y-2">
            {dataConColores.slice(0, 6).map(c => (
              <div
                key={c.nombre}
                onMouseEnter={() => setHovered(c.nombre)}
                onMouseLeave={() => setHovered(null)}
                className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${
                  hovered === c.nombre ? 'bg-slate-50' : ''
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-sm text-slate-700 flex-1 truncate">{c.nombre}</span>
                <span className="text-sm font-semibold text-slate-800 shrink-0">${fmtK(c.total)}</span>
                <span className="text-xs text-slate-400 w-12 text-right shrink-0">{c.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          {dataConColores.length > 6 && (
            <p className="text-[11px] text-slate-400 mt-3 px-2">
              + {dataConColores.length - 6} categorías más abajo
            </p>
          )}
        </div>
      </div>

      {/* Lista completa expandible */}
      <div className="space-y-1">
        {dataConColores.map(c => (
          <CategoriaItem
            key={c.nombre}
            cat={c}
            expanded={expanded === c.nombre}
            highlighted={hovered === c.nombre}
            onToggle={() => setExpanded(prev => prev === c.nombre ? null : c.nombre)}
            onHover={setHovered}
            subcategorias={subcategorias}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Donut interactivo ─────────────────────────────────────────────────────
function DonutInteractivo({
  segments,
  hoveredCat,
  onHover,
  totalGeneral,
  dataLength,
}: {
  segments:     CategoriaAgrupada[]
  hoveredCat:   string | null
  onHover:      (cat: string | null) => void
  totalGeneral: number
  dataLength:   number
}) {
  const SIZE = 200
  const HOLE = 120
  const STROKE_W   = SIZE / 2 - HOLE / 2
  const STROKE_W_H = STROKE_W + 4   // ancho cuando está hover
  const R    = (SIZE - 4) / 2
  const cx   = SIZE / 2
  const cy   = SIZE / 2
  const circ = 2 * Math.PI * R

  const hoveredItem = hoveredCat ? segments.find(s => s.nombre === hoveredCat) : null

  let offset = circ * 0.25
  const arcs = segments.map(s => {
    const len = totalGeneral > 0 ? (s.total / totalGeneral) * circ : 0
    const arc = { ...s, len, dasharray: `${len} ${circ}`, dashoffset: -offset + circ * 0.25 }
    offset += len
    return arc
  })

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`-${STROKE_W_H / 2} -${STROKE_W_H / 2} ${SIZE + STROKE_W_H} ${SIZE + STROKE_W_H}`}
        style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
      >
        {/* Pista de fondo */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE_W} />
        {arcs.map(a => {
          const isHovered = hoveredCat === a.nombre
          const isDimmed  = hoveredCat !== null && hoveredCat !== a.nombre
          return (
            <circle
              key={a.nombre}
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={isHovered ? STROKE_W_H : STROKE_W}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              style={{
                opacity:     isDimmed ? 0.35 : 1,
                transition:  'opacity 0.15s, stroke-width 0.15s',
                cursor:      'pointer',
                pointerEvents: 'stroke',
              }}
              onMouseEnter={() => onHover(a.nombre)}
              onMouseLeave={() => onHover(null)}
            />
          )
        })}
      </svg>
      {/* Texto en el centro */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-3">
        {hoveredItem ? (
          <>
            <IconoCategoria icono={hoveredItem.icono} size={14} />
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1.5 line-clamp-2 leading-tight">
              {hoveredItem.nombre}
            </p>
            <p className="text-xl font-bold text-slate-800 leading-tight mt-1">${fmtK(hoveredItem.total)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{hoveredItem.pct.toFixed(1)}% · {hoveredItem.count} mov</p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Total</p>
            <p className="text-2xl font-black text-slate-800 leading-tight mt-1">${fmtK(totalGeneral)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{dataLength} categorías</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Item de categoría (lista expandible) ──────────────────────────────────
function CategoriaItem({
  cat,
  expanded,
  highlighted,
  onToggle,
  onHover,
  subcategorias,
}: {
  cat:          CategoriaAgrupada
  expanded:     boolean
  highlighted:  boolean
  onToggle:     () => void
  onHover:      (cat: string | null) => void
  subcategorias: Subcategoria[]
}) {
  const deltaIcon = cat.deltaPct === null ? <Minus size={11} className="text-slate-300" />
    : cat.deltaPct > 5  ? <TrendingUp size={11} className="text-red-500" />
    : cat.deltaPct < -5 ? <TrendingDown size={11} className="text-emerald-600" />
    : <Minus size={11} className="text-slate-400" />

  const deltaText = cat.deltaPct === null
    ? 'sin comparable'
    : `${cat.deltaPct >= 0 ? '+' : ''}${Math.round(cat.deltaPct)}% vs anterior`

  const deltaColor = cat.deltaPct === null ? 'text-slate-300'
    : cat.deltaPct > 5  ? 'text-red-500'
    : cat.deltaPct < -5 ? 'text-emerald-600'
    : 'text-slate-400'

  return (
    <div
      className={`rounded-xl transition-all overflow-hidden ${
        expanded ? 'bg-slate-50' : highlighted ? 'bg-slate-50/60' : ''
      }`}
      onMouseEnter={() => onHover(cat.nombre)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
      >
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: cat.color }} />
        <IconoCategoria icono={cat.icono} size={15} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-slate-700 truncate">{cat.nombre}</span>
            <span className="text-sm font-bold text-slate-800 shrink-0">${fmt(cat.total)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="h-1 bg-slate-100 rounded-full flex-1 max-w-[200px] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${cat.pct}%`, background: cat.color }} />
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">{cat.pct.toFixed(1)}%</span>
            </div>
            <span className={`flex items-center gap-0.5 text-[11px] font-medium ${deltaColor} shrink-0`}>
              {deltaIcon}{deltaText}
            </span>
          </div>
        </div>
        <ChevronDown size={14} className={`text-slate-300 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && <ExpansionPanel cat={cat} subcategorias={subcategorias} />}
    </div>
  )
}

// ─── Drill-down inline ─────────────────────────────────────────────────────
function ExpansionPanel({ cat, subcategorias }: { cat: CategoriaAgrupada; subcategorias: Subcategoria[] }) {
  const subMap: Record<string, { nombre: string; total: number; count: number }> = {}
  const sinSub = { nombre: 'Sin subcategoría', total: 0, count: 0 }
  cat.movs.forEach(m => {
    if (m.subcategoria) {
      const sub = subcategorias.find(s => s.id === m.subcategoria)
      const nombre = sub?.nombre_subcategoria ?? 'Otra'
      if (!subMap[m.subcategoria]) subMap[m.subcategoria] = { nombre, total: 0, count: 0 }
      subMap[m.subcategoria].total += montoOf(m)
      subMap[m.subcategoria].count++
    } else {
      sinSub.total += montoOf(m)
      sinSub.count++
    }
  })
  const subs = Object.values(subMap).sort((a, b) => b.total - a.total)
  if (sinSub.total > 0) subs.push(sinSub)
  const hasSubs = subs.some(s => s.nombre !== 'Sin subcategoría')

  // Agrupar cuotas para que una compra en N cuotas aparezca como una sola entrada
  const topCompras = agruparCompras(cat.movs).slice(0, 5)
  const totalCat = cat.total

  return (
    <div className="px-3 pb-4 pt-1 grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          {hasSubs ? 'Subcategorías' : 'Sin subcategorías'}
        </p>
        {hasSubs ? (
          <div className="space-y-2">
            {subs.map((s, i) => {
              const pct = totalCat > 0 ? (s.total / totalCat) * 100 : 0
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-xs text-slate-700 truncate flex-1">{s.nombre}</span>
                    <span className="text-xs font-semibold text-slate-800 shrink-0">${fmtK(s.total)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat.color }} />
                    </div>
                    <span className="text-[9px] text-slate-400 w-7 text-right">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Esta categoría no tiene subcategorías asignadas en este período.</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Top movimientos</p>
        <div className="space-y-1.5">
          {topCompras.map((c, i) => (
            <div key={c.representativo.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 w-3 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-slate-700 truncate">{c.detalle || 'Sin detalle'}</p>
                  {c.isCuota && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0 text-[8px] font-semibold rounded bg-amber-50 text-amber-700 shrink-0 uppercase tracking-wider">
                      <Layers size={7} />{c.cuotasTotal}c
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  {c.isCuota
                    ? `${c.cuotasTotal} × $${fmtK(c.cuotaMontoPromedio)} · 1ra ${formatFechaCorta(c.fechaPrimera)}`
                    : formatFechaCorta(c.fechaPrimera)
                  }
                </p>
              </div>
              <span className="font-semibold text-slate-800 shrink-0">${fmt(c.montoTotal)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Últimos 6 meses</p>
        {cat.mensual.some(v => v > 0) ? (
          <>
            <Sparkline data={cat.mensual} width={240} height={48} color={cat.color} />
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2">
              <span>Mín ${fmtK(Math.min(...cat.mensual.filter(v => v > 0)))}</span>
              <span>Máx ${fmtK(Math.max(...cat.mensual))}</span>
              <span>Prom ${fmtK(cat.mensual.reduce((a, b) => a + b, 0) / 6)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">Sin historial mensual disponible</p>
        )}
      </div>
    </div>
  )
}
