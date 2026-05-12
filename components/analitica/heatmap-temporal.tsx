'use client'

// ─── Heatmap temporal — por día de semana y por día del mes ─────────────────
//
// Dos vistas en una card:
//   - "Día de semana": 7 celdas (Lun-Dom), intensidad por gasto total
//   - "Día del mes": 31 celdas, intensidad por gasto promedio en ese día
//
// El gasto promedio del día del mes ayuda a ver patrones tipo "alrededor del 5
// gasto siempre mucho (alquiler)" sin contar los meses donde ese día no ocurrió.

import { useState, useMemo } from 'react'
import { montoOf, parseFecha, fmtK, fmt, type MovAnalitica } from './utils'

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function HeatmapTemporal({ movs }: { movs: MovAnalitica[] }) {
  const [vista, setVista] = useState<'semana' | 'mes'>('semana')

  const gastos = useMemo(() => movs.filter(m => m.tipo_movimiento === 'Gasto'), [movs])

  // ── Día de la semana: total + count + promedio por día ──
  const semanaData = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]
    const counts = [0, 0, 0, 0, 0, 0, 0]
    gastos.forEach(m => {
      const dow = parseFecha(m.fecha).getDay()
      totals[dow] += montoOf(m)
      counts[dow]++
    })
    return DOW_LABELS.map((label, i) => ({
      label,
      total: totals[i],
      count: counts[i],
      promedio: counts[i] > 0 ? totals[i] / counts[i] : 0,
    }))
  }, [gastos])

  // ── Día del mes ──
  const mesData = useMemo(() => {
    const totals: number[] = Array(31).fill(0)
    const counts: number[] = Array(31).fill(0)
    gastos.forEach(m => {
      const dom = parseFecha(m.fecha).getDate() - 1  // 0-30
      totals[dom] += montoOf(m)
      counts[dom]++
    })
    return totals.map((total, i) => ({
      dia: i + 1,
      total,
      count: counts[i],
    }))
  }, [gastos])

  const semanaMax = Math.max(...semanaData.map(d => d.total), 1)
  const mesMax    = Math.max(...mesData.map(d => d.total), 1)

  // Reorder Lun-Dom (Mon first, Sun last) para semanaData
  const semanaReordered = [
    semanaData[1], semanaData[2], semanaData[3], semanaData[4],
    semanaData[5], semanaData[6], semanaData[0],
  ]

  // Top día de semana
  const topDia = [...semanaReordered].sort((a, b) => b.total - a.total)[0]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Patrón temporal de gastos</p>
          <p className="text-xs text-slate-400">
            {vista === 'semana'
              ? `Día más caro: ${topDia.label.toLowerCase()} · promedio $${fmt(Math.round(topDia.promedio))}/movimiento`
              : 'Distribución por día del mes (suma de todos los meses)'}
          </p>
        </div>
        <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setVista('semana')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              vista === 'semana' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Día de semana
          </button>
          <button
            onClick={() => setVista('mes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              vista === 'mes' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Día del mes
          </button>
        </div>
      </div>

      {vista === 'semana' ? (
        <div className="grid grid-cols-7 gap-2">
          {semanaReordered.map(d => {
            const intensity = d.total / semanaMax
            return (
              <div
                key={d.label}
                className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex flex-col items-center justify-center text-center transition-transform hover:scale-[1.02]"
                title={`${d.label}: $${fmt(d.total)} en ${d.count} movimientos`}
              >
                {/* Barra de intensidad arriba */}
                <div className="w-full h-1.5 bg-slate-200/60">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${intensity * 100}%`, background: '#dc2626' }}
                  />
                </div>
                <div className="p-3 w-full">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{d.label}</p>
                  <p className="text-sm font-bold text-slate-800">${fmtK(d.total)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{d.count} mov</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 sm:grid-cols-10 lg:grid-cols-[repeat(16,minmax(0,1fr))] gap-1.5">
            {mesData.map(d => {
              const intensity = d.total / mesMax
              const bg = d.total === 0
                ? '#f8fafc'
                : `rgba(220, 38, 38, ${0.08 + intensity * 0.5})`
              return (
                <div
                  key={d.dia}
                  className="aspect-square rounded-md flex flex-col items-center justify-center text-center transition-transform hover:scale-110"
                  style={{ background: bg }}
                  title={d.total > 0 ? `Día ${d.dia}: $${fmt(d.total)} en ${d.count} movimientos` : `Día ${d.dia}: sin gastos`}
                >
                  <p className={`text-[10px] leading-none ${intensity > 0.5 ? 'text-white/90' : 'text-slate-500'}`}>{d.dia}</p>
                  {d.total > 0 && (
                    <p className={`text-[9px] font-semibold leading-none mt-0.5 ${intensity > 0.5 ? 'text-white' : 'text-slate-700'}`}>{fmtK(d.total)}</p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className="text-[10px] text-slate-400">Bajo</span>
            <div className="flex-1 h-2 rounded-full" style={{
              background: 'linear-gradient(90deg, rgba(220,38,38,0.08), rgba(220,38,38,0.58))',
            }} />
            <span className="text-[10px] text-slate-400">Alto</span>
          </div>
        </div>
      )}
    </div>
  )
}
