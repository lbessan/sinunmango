'use client'

// ─── Primera vs Segunda quincena ─────────────────────────────────────────────
//
// Análisis del comportamiento mensual partido por quincena:
//   - Días 1-15: primera quincena (cobro de sueldo en muchos casos)
//   - Días 16-31: segunda quincena
//
// Muestra distribución del gasto y categorías que dominan cada mitad.

import { useMemo } from 'react'
import { CalendarRange } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { fmt, fmtK, montoOf, parseFecha, type MovAnalitica } from './utils'

type QuincenaData = {
  total:    number
  count:    number
  topCats:  { nombre: string; icono: string | null; total: number }[]
}

export function PanelQuincenas({ movs }: { movs: MovAnalitica[] }) {
  const data = useMemo(() => {
    const primera: Record<string, { icono: string | null; total: number }> = {}
    const segunda: Record<string, { icono: string | null; total: number }> = {}
    let totalP = 0, totalS = 0, countP = 0, countS = 0

    movs.filter(m => m.tipo_movimiento === 'Gasto').forEach(m => {
      const day = parseFecha(m.fecha).getDate()
      const monto = montoOf(m)
      const cat = m.categoria_nombre ?? 'Sin categoría'
      const map = day <= 15 ? primera : segunda
      if (!map[cat]) map[cat] = { icono: m.categoria_icono, total: 0 }
      map[cat].total += monto
      if (day <= 15) { totalP += monto; countP++ }
      else           { totalS += monto; countS++ }
    })

    const sortTop = (m: Record<string, { icono: string | null; total: number }>) =>
      Object.entries(m).sort((a, b) => b[1].total - a[1].total).slice(0, 3)
        .map(([nombre, v]) => ({ nombre, icono: v.icono, total: v.total }))

    return {
      primera: { total: totalP, count: countP, topCats: sortTop(primera) },
      segunda: { total: totalS, count: countS, topCats: sortTop(segunda) },
    }
  }, [movs])

  const total = data.primera.total + data.segunda.total
  const pctP  = total > 0 ? (data.primera.total / total) * 100 : 50
  const pctS  = total > 0 ? (data.segunda.total / total) * 100 : 50
  const skew  = pctP - pctS

  let narrative = ''
  if (Math.abs(skew) < 8) {
    narrative = 'Tu gasto está balanceado entre las dos mitades del mes.'
  } else if (skew > 0) {
    narrative = `Gastás ${Math.round(Math.abs(skew))}% más en la primera quincena. Típico de personas que reciben sueldo a principio de mes.`
  } else {
    narrative = `Gastás ${Math.round(Math.abs(skew))}% más en la segunda quincena. Quizás cobrás sueldo a fin de mes o concentrás compras grandes ahí.`
  }

  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-1">Primera vs segunda quincena</p>
        <p className="text-xs text-slate-400 py-6 text-center">Sin gastos en el período</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <CalendarRange size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">Primera vs segunda quincena</p>
          <p className="text-xs text-slate-400">{narrative}</p>
        </div>
      </div>

      {/* Bar comparison */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <QuincenaBlock
          label="Primera quincena"
          subtitle="Días 1–15"
          pct={pctP}
          data={data.primera}
        />
        <QuincenaBlock
          label="Segunda quincena"
          subtitle="Días 16–31"
          pct={pctS}
          data={data.segunda}
        />
      </div>
    </div>
  )
}

function QuincenaBlock({
  label, subtitle, pct, data,
}: {
  label:    string
  subtitle: string
  pct:      number
  data:     QuincenaData
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <span className="text-[10px] text-slate-400">{subtitle}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 mb-1">${fmt(Math.round(data.total))}</p>
      <p className="text-xs text-slate-500 mb-3">{data.count} movs · {pct.toFixed(0)}% del total</p>

      <div className="h-1.5 bg-slate-200/70 rounded-full overflow-hidden mb-3">
        <div className="h-full" style={{ width: `${pct}%`, background: '#6366f1' }} />
      </div>

      {data.topCats.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Top categorías</p>
          <div className="space-y-1">
            {data.topCats.map(c => (
              <div key={c.nombre} className="flex items-center gap-1.5 text-xs">
                <IconoCategoria icono={c.icono} size={11} />
                <span className="text-slate-600 flex-1 truncate">{c.nombre}</span>
                <span className="font-semibold text-slate-700">${fmtK(c.total)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
