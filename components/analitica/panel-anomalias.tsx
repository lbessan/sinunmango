'use client'

// ─── Panel de anomalías de gasto ─────────────────────────────────────────────
//
// Muestra categorías cuyo gasto del mes actual está significativamente arriba
// de su promedio histórico. Si no hay anomalías, mostramos un mensaje
// positivo "todo bajo control".

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { detectarAnomalias, type AnomaliaItem } from './gastos-anomalias'
import { fmt, type MovAnalitica } from './utils'

export function PanelAnomalias({ movs }: { movs: MovAnalitica[] }) {
  const anomalias = useMemo(() => detectarAnomalias(movs), [movs])

  if (anomalias.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Sin anomalías de gasto</p>
            <p className="text-xs text-slate-400">Este mes todas tus categorías están dentro de tu rango histórico habitual.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <AlertTriangle size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">
            {anomalias.length} {anomalias.length === 1 ? 'categoría' : 'categorías'} fuera de tu promedio
          </p>
          <p className="text-xs text-slate-400">Este mes gastaste significativamente más en estas áreas</p>
        </div>
      </div>

      <div className="space-y-3">
        {anomalias.map(a => (
          <AnomaliaRow key={a.categoria} a={a} />
        ))}
      </div>
    </div>
  )
}

function AnomaliaRow({ a }: { a: AnomaliaItem }) {
  const severeStyles = a.severidad === 'alta'
    ? { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-600', dot: 'bg-red-500' }
    : { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-600', dot: 'bg-amber-500' }

  // Bar visual: cuánto es lo "normal" vs lo actual
  const baseWidthPct = 60   // baseline visual: 60% del bar = promedio
  const actualWidthPct = Math.min(100, (a.actual / a.promedio) * baseWidthPct)

  return (
    <div className={`rounded-xl p-3.5 border ${severeStyles.border} ${severeStyles.bg}`}>
      <div className="flex items-center gap-3 mb-2.5">
        <IconoCategoria icono={a.icono} size={16} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{a.categoria}</p>
          <p className="text-[11px] text-slate-500">
            Promedio últimos {a.mesesHistoricos} meses: ${fmt(Math.round(a.promedio))} · máximo previo: ${fmt(Math.round(a.mejorComparable))}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${severeStyles.text}`}>+{Math.round(a.deltaPct)}%</p>
          <p className="text-xs text-slate-500">${fmt(Math.round(a.actual))}</p>
        </div>
      </div>
      {/* Bar comparativa */}
      <div className="relative h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
        {/* baseline = promedio */}
        <div
          className="absolute top-0 left-0 h-full bg-slate-300"
          style={{ width: `${baseWidthPct}%` }}
        />
        {/* actual */}
        <div
          className={`absolute top-0 left-0 h-full ${severeStyles.dot}`}
          style={{ width: `${actualWidthPct}%`, opacity: 0.8 }}
        />
        {/* tick del promedio */}
        <div
          className="absolute top-0 h-full w-px bg-slate-600"
          style={{ left: `${baseWidthPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-400 mt-1">
        <span>$0</span>
        <span>tu promedio</span>
      </div>
    </div>
  )
}
