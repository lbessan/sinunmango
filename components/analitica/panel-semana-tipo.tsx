'use client'

// ─── Tu semana tipo ──────────────────────────────────────────────────────────
//
// Para cada día de la semana, encontramos:
//   - La categoría top (donde más gastás)
//   - El monto total ese día
//   - El day más caro vs el más barato (highlights visuales)

import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { fmt, fmtK, montoOf, parseFecha, type MovAnalitica } from './utils'

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

type DowData = {
  dow:    number
  label:  string
  total:  number
  count:  number
  topCat: { nombre: string; icono: string | null; total: number } | null
}

export function PanelSemanaTipo({ movs }: { movs: MovAnalitica[] }) {
  const data = useMemo<DowData[]>(() => {
    // Agrupar gastos por (día de semana, categoría)
    const byDowCat: Record<number, Record<string, { icono: string | null; total: number }>> = {}
    const byDowTotal: Record<number, { total: number; count: number }> = {}

    for (let i = 0; i < 7; i++) {
      byDowCat[i] = {}
      byDowTotal[i] = { total: 0, count: 0 }
    }

    movs.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
      const dow = parseFecha(m.fecha).getDay()
      const cat = m.categoria_nombre ?? 'Sin categoría'
      if (!byDowCat[dow][cat]) byDowCat[dow][cat] = { icono: m.categoria_icono, total: 0 }
      byDowCat[dow][cat].total += montoOf(m)
      byDowTotal[dow].total += montoOf(m)
      byDowTotal[dow].count++
    })

    return [...Array(7)].map((_, i) => {
      const cats = Object.entries(byDowCat[i])
      const top  = cats.sort((a, b) => b[1].total - a[1].total)[0]
      return {
        dow:    i,
        label:  DOW_LABELS[i],
        total:  byDowTotal[i].total,
        count:  byDowTotal[i].count,
        topCat: top ? { nombre: top[0], icono: top[1].icono, total: top[1].total } : null,
      }
    })
  }, [movs])

  // Reordenar Lun-Dom
  const ordered = [data[1], data[2], data[3], data[4], data[5], data[6], data[0]]
  const max     = Math.max(...ordered.map(d => d.total), 1)
  const topDow  = [...ordered].sort((a, b) => b.total - a.total)[0]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <CalendarDays size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">Tu semana tipo</p>
          <p className="text-xs text-slate-400">
            {topDow.total > 0
              ? `Día con más gasto: ${topDow.label.toLowerCase()} — ${topDow.topCat ? `categoría top: ${topDow.topCat.nombre}` : ''}`
              : 'Sin datos para detectar patrones semanales'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {ordered.map(d => {
          const intensity = d.total / max
          const isTop = d.total === topDow.total && d.total > 0
          return (
            <div
              key={d.label}
              className={`rounded-xl border overflow-hidden flex flex-col ${
                isTop ? 'border-indigo-200' : 'border-slate-100 bg-slate-50/50'
              }`}
            >
              <div className="w-full h-1.5 bg-slate-200/60">
                <div className="h-full" style={{ width: `${intensity * 100}%`, background: '#6366f1' }} />
              </div>
              <div className="p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{d.label}</p>
                <p className="text-sm font-bold text-slate-800 mb-0.5">
                  {d.total > 0 ? `$${fmtK(d.total)}` : '—'}
                </p>
                {d.topCat ? (
                  <div className="mt-2 flex items-center justify-center gap-1">
                    <IconoCategoria icono={d.topCat.icono} size={10} />
                    <span className="text-[9px] text-slate-500 truncate">{d.topCat.nombre}</span>
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-300 mt-2">sin gastos</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
