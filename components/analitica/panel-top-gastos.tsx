'use client'

// ─── Top compras individuales ────────────────────────────────────────────────
//
// Las cuotas se agrupan: una compra en 12 cuotas se cuenta como UNA compra
// con monto = suma de todas las cuotas (la decisión financiera, no el
// movimiento mensual).

import { useMemo } from 'react'
import { Layers } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { fmt, fmtK, formatFechaCorta, type MovAnalitica } from './utils'
import { agruparCompras } from './agrupar-compras'

export function PanelTopGastos({ movs }: { movs: MovAnalitica[] }) {
  const items = useMemo(() => {
    const gastos = movs.filter(m => m.tipo_movimiento === 'Gasto')
    return agruparCompras(gastos).slice(0, 10)
  }, [movs])

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-1">Top 10 compras individuales</p>
        <p className="text-xs text-slate-400 py-6 text-center">Sin gastos en este período</p>
      </div>
    )
  }

  const maxMonto = items[0].montoTotal

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <p className="text-sm font-semibold text-slate-700 mb-0.5">Top 10 compras individuales</p>
      <p className="text-xs text-slate-400 mb-5">
        Las compras de mayor monto en el período · las compras en cuotas cuentan como una sola transacción
      </p>

      <div className="space-y-3">
        {items.map((c, i) => {
          const pct = (c.montoTotal / maxMonto) * 100
          return (
            <div key={c.representativo.id} className="group">
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                <IconoCategoria icono={c.representativo.categoria_icono} size={14} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-800 font-medium truncate">
                      {c.detalle}
                    </p>
                    {c.isCuota && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-50 text-amber-700 shrink-0 uppercase tracking-wider">
                        <Layers size={9} />{c.cuotasTotal} cuotas
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {c.representativo.categoria_nombre ?? 'Sin categoría'}
                    {' · '}
                    {c.isCuota
                      ? `${c.cuotasTotal} × $${fmtK(c.cuotaMontoPromedio)} · 1ra cuota ${formatFechaCorta(c.fechaPrimera)}`
                      : formatFechaCorta(c.fechaPrimera)
                    }
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-800 shrink-0">${fmt(c.montoTotal)}</span>
              </div>
              <div className="ml-10 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: 'var(--accent2, #1B3A6B)' }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
