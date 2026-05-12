'use client'

// ─── Panel de gastos recurrentes ─────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { Repeat, ChevronRight } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { detectarRecurrentes, type RecurrenteItem } from './gastos-recurrentes'
import { fmt, fmtK, formatFechaCorta, type MovAnalitica } from './utils'

export function PanelRecurrentes({ movs }: { movs: MovAnalitica[] }) {
  const [expanded, setExpanded] = useState(false)

  const recurrentes = useMemo(() => detectarRecurrentes(movs), [movs])

  const mensuales = recurrentes.filter(r => r.frecuencia === 'mensual')
  const totalMensual = mensuales.reduce((a, r) => a + r.montoPromedio, 0)
  const totalAnual   = mensuales.reduce((a, r) => a + (r.totalAnualEstimado ?? 0), 0)

  if (recurrentes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
            <Repeat size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Gastos recurrentes</p>
            <p className="text-xs text-slate-400">No detectamos gastos que se repitan en ≥3 meses con monto similar</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Cuando tengas suscripciones o pagos mensuales recurrentes (Netflix, alquiler, gimnasio),
          van a aparecer acá automáticamente.
        </p>
      </div>
    )
  }

  const visibles = expanded ? recurrentes : recurrentes.slice(0, 6)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
            <Repeat size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Gastos recurrentes detectados</p>
            <p className="text-xs text-slate-400">
              {recurrentes.length} {recurrentes.length === 1 ? 'gasto' : 'gastos'} se repiten · {mensuales.length} mensual{mensuales.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>
        {totalMensual > 0 && (
          <div className="text-right">
            <p className="text-xs text-slate-400">Costo mensual estimado</p>
            <p className="text-lg font-bold text-slate-800">${fmt(Math.round(totalMensual))}</p>
            <p className="text-[10px] text-slate-400">~${fmt(Math.round(totalAnual))}/año</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {visibles.map(r => (
          <RecurrenteRow key={r.detalle + (r.categoria ?? '')} r={r} />
        ))}
      </div>

      {recurrentes.length > 6 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-4 w-full text-xs font-medium text-slate-500 hover:text-slate-700 py-2 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
        >
          {expanded
            ? `Ver menos`
            : `Ver ${recurrentes.length - 6} más`}
          <ChevronRight size={12} className={expanded ? 'rotate-90' : ''} />
        </button>
      )}
    </div>
  )
}

function RecurrenteRow({ r }: { r: RecurrenteItem }) {
  const isMonthly = r.frecuencia === 'mensual'
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <IconoCategoria icono={r.categoriaIcono} size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-slate-700 truncate">{r.detalleOriginal}</p>
          {isMonthly && (
            <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-blue-50 text-blue-600 shrink-0 uppercase tracking-wider">
              Mensual
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 truncate">
          {r.categoria ?? 'Sin categoría'} · {r.ocurrencias} ocurrencias en {r.mesesActivos} meses · últ. {formatFechaCorta(r.ultimoVisto)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-slate-800">${fmt(Math.round(r.montoPromedio))}</p>
        {isMonthly && r.totalAnualEstimado && (
          <p className="text-[10px] text-slate-400">${fmtK(r.totalAnualEstimado)}/año</p>
        )}
      </div>
    </div>
  )
}
