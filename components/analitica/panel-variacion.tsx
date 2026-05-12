'use client'

// ─── Variación mes a mes (rediseñada) ────────────────────────────────────────
//
// Comparativa de gasto por categoría: mes previo vs mes anterior.
// Dos vistas (completo / hasta día X) y orden configurable.

import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { fmt, montoOf, type MovAnalitica } from './utils'

type VariacionRow = {
  nombre:   string
  icono:    string | null
  actual:   number
  anterior: number
  delta:    number | null
}

type SortKey = 'monto' | 'crecimiento' | 'reduccion' | 'alfabetico'

const SORT_LABELS: Record<SortKey, string> = {
  monto:       'Mayor monto',
  crecimiento: 'Más creció',
  reduccion:   'Más se redujo',
  alfabetico:  'A → Z',
}

function buildCatMap(movs: MovAnalitica[]): Record<string, { icono: string | null; total: number }> {
  const out: Record<string, { icono: string | null; total: number }> = {}
  movs.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
    const k = m.categoria_nombre ?? 'Sin categoría'
    if (!out[k]) out[k] = { icono: m.categoria_icono, total: 0 }
    out[k].total += montoOf(m)
  })
  return out
}

function buildRows(actual: ReturnType<typeof buildCatMap>, anterior: ReturnType<typeof buildCatMap>): VariacionRow[] {
  const todas = new Set([...Object.keys(actual), ...Object.keys(anterior)])
  return [...todas]
    .map(cat => ({
      nombre:   cat,
      icono:    actual[cat]?.icono ?? anterior[cat]?.icono ?? null,
      actual:   actual[cat]?.total ?? 0,
      anterior: anterior[cat]?.total ?? 0,
      delta:    anterior[cat]?.total
        ? ((actual[cat]?.total ?? 0) - anterior[cat].total) / anterior[cat].total * 100
        : null,
    }))
    .filter(r => r.actual > 0 || r.anterior > 0)
}

function sortRows(rows: VariacionRow[], key: SortKey): VariacionRow[] {
  const copy = [...rows]
  switch (key) {
    case 'monto':
      return copy.sort((a, b) => b.actual - a.actual)
    case 'crecimiento':
      // Más creció (delta positivo grande primero). null al final.
      return copy.sort((a, b) => {
        if (a.delta === null && b.delta === null) return b.actual - a.actual
        if (a.delta === null) return 1
        if (b.delta === null) return -1
        return b.delta - a.delta
      })
    case 'reduccion':
      // Más se redujo (delta negativo más grande primero, i.e. más negativo)
      return copy.sort((a, b) => {
        if (a.delta === null && b.delta === null) return b.actual - a.actual
        if (a.delta === null) return 1
        if (b.delta === null) return -1
        return a.delta - b.delta
      })
    case 'alfabetico':
      return copy.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
}

export function PanelVariacion({ movsTodos }: { movsTodos: MovAnalitica[] }) {
  const [vista, setVista] = useState<'completa' | 'actual'>('completa')
  const [sortKey, setSortKey] = useState<SortKey>('monto')

  const hoy       = new Date()
  const diaHoy    = hoy.getDate()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const dM1       = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const dM2       = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)
  const mesPrevio   = `${dM1.getFullYear()}-${String(dM1.getMonth() + 1).padStart(2, '0')}`
  const mesAnterior = `${dM2.getFullYear()}-${String(dM2.getMonth() + 1).padStart(2, '0')}`

  const rowsRaw = useMemo(() => {
    if (vista === 'completa') {
      const mapAct = buildCatMap(movsTodos.filter(m => m.fecha.slice(0, 7) === mesPrevio))
      const mapAnt = buildCatMap(movsTodos.filter(m => m.fecha.slice(0, 7) === mesAnterior))
      return buildRows(mapAct, mapAnt)
    } else {
      const mapAct = buildCatMap(movsTodos.filter(m =>
        m.fecha.slice(0, 7) === mesActual && parseInt(m.fecha.slice(8, 10)) <= diaHoy
      ))
      const mapAnt = buildCatMap(movsTodos.filter(m =>
        m.fecha.slice(0, 7) === mesPrevio && parseInt(m.fecha.slice(8, 10)) <= diaHoy
      ))
      return buildRows(mapAct, mapAnt)
    }
  }, [movsTodos, vista, mesActual, mesPrevio, mesAnterior, diaHoy])

  const rows = useMemo(() => sortRows(rowsRaw, sortKey).slice(0, 12), [rowsRaw, sortKey])

  const mesActualLabel   = hoy.toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
  const mesPrevioLabel   = dM1.toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
  const mesAnteriorLabel = dM2.toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())

  const labelAct = vista === 'completa' ? mesPrevioLabel : mesActualLabel
  const labelAnt = vista === 'completa' ? mesAnteriorLabel : mesPrevioLabel

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-sm font-semibold text-slate-700">Variación mes a mes</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {vista === 'completa'
              ? `${mesAnteriorLabel} completo vs ${mesPrevioLabel} completo`
              : `${mesPrevioLabel} vs ${mesActualLabel} · ambos hasta el día ${diaHoy}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="appearance-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl pl-3 pr-7 py-1.5 cursor-pointer outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                <option key={k} value={k}>Ordenar por: {SORT_LABELS[k]}</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {/* Vista toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setVista('completa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                vista === 'completa' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Mes completo
            </button>
            <button
              onClick={() => setVista('actual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                vista === 'actual' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Día {diaHoy} vs día {diaHoy}
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">Sin datos suficientes para comparar</p>
      ) : (
        <>
          {/* Header */}
          <div className="grid grid-cols-[1fr_88px_88px_64px] gap-2 pb-2 border-b border-slate-100 mb-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest">Categoría</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest text-right">{labelAct}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest text-right">{labelAnt}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest text-right">Var.</span>
          </div>
          {rows.map(r => <VariacionItem key={r.nombre} r={r} />)}
        </>
      )}
    </div>
  )
}

function VariacionItem({ r }: { r: VariacionRow }) {
  const deltaBadge = r.delta === null ? (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-300 justify-end">
      <Minus size={10} />
    </span>
  ) : r.delta > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 justify-end">
      <TrendingUp size={10} />+{Math.round(r.delta)}%
    </span>
  ) : r.delta < 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 justify-end">
      <TrendingDown size={10} />{Math.round(r.delta)}%
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-400 justify-end">
      <Minus size={10} />0%
    </span>
  )

  return (
    <div className="grid grid-cols-[1fr_88px_88px_64px] gap-2 items-center py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <IconoCategoria icono={r.icono} size={13} />
        <span className="text-sm text-slate-700 truncate">{r.nombre}</span>
      </div>
      <span className="text-sm font-semibold text-slate-800 text-right">
        {r.actual > 0 ? `$${fmt(r.actual)}` : '—'}
      </span>
      <span className="text-sm text-slate-400 text-right">
        {r.anterior > 0 ? `$${fmt(r.anterior)}` : '—'}
      </span>
      {deltaBadge}
    </div>
  )
}
