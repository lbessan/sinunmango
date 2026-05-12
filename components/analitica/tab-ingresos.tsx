'use client'

// ─── Tab Ingresos ────────────────────────────────────────────────────────────
//
// Secciones:
//   1. Period selector
//   2. Hero: total ingresos + comparativa vs anterior + tasa de ahorro del período
//   3. Cards de estabilidad: promedio mensual, variabilidad (CV%), mejor mes, peor mes
//   4. Evolución mensual de ingresos (barras + línea de promedio)
//   5. Fuentes de ingreso (por cuenta destino)
//   6. Categorías de ingreso
//   7. Top ingresos individuales

import { useState, useMemo } from 'react'
import {
  TrendingUp, Target, Award, AlertCircle, Banknote, Tag,
} from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { PeriodSelector } from './period-selector'
import { InsightCard, HeroCard }    from './insight-card'
import { Sparkline }      from './sparkline'
import {
  fmt, fmtK, formatFechaCorta, montoOf, parseFecha, pctDelta,
  getDateRange, getMeses, type MovAnalitica, type Preset,
} from './utils'

const COL_INCOME = '#1a6b5a'

export function TabIngresos({ movimientos }: { movimientos: MovAnalitica[] }) {
  const [preset, setPreset] = useState<Preset>('6M')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')

  const { desde, hasta } = useMemo(() => {
    if (preset === 'custom' && customDesde && customHasta) {
      return {
        desde: new Date(customDesde + 'T00:00:00'),
        hasta: new Date(customHasta + 'T23:59:59'),
      }
    }
    if (preset === 'custom') return getDateRange('6M')
    return getDateRange(preset)
  }, [preset, customDesde, customHasta])

  // ── Movimientos del período ──
  const movsPeriodo = useMemo(() =>
    movimientos.filter(m => {
      const f = parseFecha(m.fecha)
      return f >= desde && f <= hasta
    }),
    [movimientos, desde, hasta]
  )

  const ingresos = useMemo(() => movsPeriodo.filter(m => m.tipo_movimiento === 'Ingreso'), [movsPeriodo])
  const gastos   = useMemo(() => movsPeriodo.filter(m => m.tipo_movimiento === 'Gasto'),   [movsPeriodo])

  const totalIngresos = ingresos.reduce((a, m) => a + montoOf(m), 0)
  const totalGastos   = gastos.reduce((a, m) => a + montoOf(m), 0)
  const neto          = totalIngresos - totalGastos
  const savingsRate   = totalIngresos > 0 ? (neto / totalIngresos) * 100 : 0

  // ── Período anterior del mismo tamaño ──
  const duracion = hasta.getTime() - desde.getTime()
  const antHasta = new Date(desde.getTime() - 86_400_000)
  const antDesde = new Date(antHasta.getTime() - duracion)
  const ingresosAnt = movimientos.filter(m => {
    const f = parseFecha(m.fecha)
    return f >= antDesde && f <= antHasta && m.tipo_movimiento === 'Ingreso'
  })
  const totalIngresosAnt = ingresosAnt.reduce((a, m) => a + montoOf(m), 0)
  const deltaPct = pctDelta(totalIngresos, totalIngresosAnt)

  // ── Mensual ──
  const meses = useMemo(() => getMeses(desde, hasta), [desde, hasta])
  const mensual = useMemo(() => {
    const map: Record<string, number> = {}
    meses.forEach(m => { map[m] = 0 })
    ingresos.forEach(m => {
      const key = m.fecha.slice(0, 7)
      if (map[key] !== undefined) map[key] += montoOf(m)
    })
    return meses.map(m => ({
      mes:   m,
      label: new Date(m + '-15T12:00:00')
        .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
        .replace('.', '')
        .replace(/^\w/, c => c.toUpperCase()),
      total: map[m],
    }))
  }, [meses, ingresos])

  // Estabilidad: stats sobre meses con ingreso > 0
  const conIngreso  = mensual.filter(m => m.total > 0)
  const promMensual = conIngreso.length > 0 ? conIngreso.reduce((a, m) => a + m.total, 0) / conIngreso.length : 0
  const variance    = conIngreso.length > 0
    ? conIngreso.reduce((a, m) => a + Math.pow(m.total - promMensual, 2), 0) / conIngreso.length
    : 0
  const stddev      = Math.sqrt(variance)
  const coefVar     = promMensual > 0 ? (stddev / promMensual) * 100 : 0
  const mejorMes    = [...mensual].sort((a, b) => b.total - a.total)[0]
  const peorMes     = [...mensual].filter(m => m.total > 0).sort((a, b) => a.total - b.total)[0]
  const mesesSinIngreso = mensual.filter(m => m.total === 0).length

  // ── Fuentes de ingreso (por cuenta_origen_nombre) ──
  const fuentes = useMemo(() => {
    const map: Record<string, { total: number; count: number; tipo: string | null }> = {}
    ingresos.forEach(m => {
      const k = m.cuenta_origen_nombre ?? 'Sin cuenta asignada'
      if (!map[k]) map[k] = { total: 0, count: 0, tipo: m.cuenta_origen_tipo }
      map[k].total += montoOf(m)
      map[k].count++
    })
    return Object.entries(map)
      .map(([nombre, v]) => ({ nombre, ...v, pct: totalIngresos > 0 ? (v.total / totalIngresos) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [ingresos, totalIngresos])

  // ── Categorías de ingreso ──
  const categorias = useMemo(() => {
    const map: Record<string, { icono: string | null; total: number; count: number }> = {}
    ingresos.forEach(m => {
      const k = m.categoria_nombre ?? 'Sin categoría'
      if (!map[k]) map[k] = { icono: m.categoria_icono, total: 0, count: 0 }
      map[k].total += montoOf(m)
      map[k].count++
    })
    return Object.entries(map)
      .map(([nombre, v]) => ({ nombre, ...v, pct: totalIngresos > 0 ? (v.total / totalIngresos) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [ingresos, totalIngresos])

  // ── Top ingresos individuales ──
  const topIngresos = useMemo(() =>
    [...ingresos].sort((a, b) => montoOf(b) - montoOf(a)).slice(0, 10),
    [ingresos]
  )

  // ── Hero narrative ──
  const heroSub = deltaPct !== null
    ? `${deltaPct >= 0 ? '+' : ''}${Math.round(deltaPct)}% vs período anterior · ${deltaPct >= 0 ? 'crecimiento' : 'caída'}`
    : 'Sin período anterior comparable'

  // ── Variabilidad (coefVar) clasificada ──
  const estabilidadLabel =
    coefVar < 15 ? 'Muy estable'  :
    coefVar < 30 ? 'Estable'      :
    coefVar < 50 ? 'Variable'     :
                   'Muy variable'

  const estabilidadTone: 'positive' | 'neutral' | 'warning' | 'negative' =
    coefVar < 15 ? 'positive' :
    coefVar < 30 ? 'positive' :
    coefVar < 50 ? 'warning'  :
                   'negative'

  if (movsPeriodo.length === 0) {
    return (
      <div className="space-y-6">
        <PeriodSelector
          preset={preset}
          customDesde={customDesde}
          customHasta={customHasta}
          onPresetChange={setPreset}
          onCustomDesdeChange={setCustomDesde}
          onCustomHastaChange={setCustomHasta}
        />
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <p className="text-sm text-slate-500">Sin movimientos en este período</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PeriodSelector
        preset={preset}
        customDesde={customDesde}
        customHasta={customHasta}
        onPresetChange={setPreset}
        onCustomDesdeChange={setCustomDesde}
        onCustomHastaChange={setCustomHasta}
      />

      {/* ── Hero ── */}
      <HeroCard
        label="Total ingresado en el período"
        value={`$${fmt(totalIngresos)}`}
        sub={heroSub}
        tone={deltaPct !== null && deltaPct >= 0 ? 'positive' : 'neutral'}
        detail={
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-6 lg:gap-2 lg:min-w-[200px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Tasa de ahorro</p>
              <p className={`text-xl font-bold ${savingsRate >= 20 ? 'text-emerald-600' : savingsRate >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                {Math.round(savingsRate)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Movimientos</p>
              <p className="text-xl font-bold text-slate-700">{ingresos.length}</p>
            </div>
          </div>
        }
      />

      {/* ── Cards de estabilidad ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InsightCard
          label="Promedio mensual"
          icon={<Target size={14} />}
          value={`$${fmtK(promMensual)}`}
          sub={`${conIngreso.length} de ${mensual.length} meses con ingreso`}
          tone="neutral"
          footer={
            conIngreso.length >= 2 ? (
              <Sparkline data={mensual.map(m => m.total)} width={200} height={32} color={COL_INCOME} />
            ) : null
          }
        />

        <InsightCard
          label="Estabilidad"
          icon={<TrendingUp size={14} />}
          value={estabilidadLabel}
          sub={`CV ${Math.round(coefVar)}% — desvío típico: $${fmtK(stddev)}`}
          tone={estabilidadTone}
        />

        {mejorMes && mejorMes.total > 0 ? (
          <InsightCard
            label="Mejor mes"
            icon={<Award size={14} />}
            value={`$${fmtK(mejorMes.total)}`}
            sub={`${mejorMes.label} — ${promMensual > 0 ? `${Math.round(((mejorMes.total / promMensual) - 1) * 100)}% sobre tu promedio` : ''}`}
            tone="positive"
          />
        ) : (
          <InsightCard label="Mejor mes" value="—" sub="Sin ingresos en el período" tone="neutral" icon={<Award size={14} />} />
        )}

        {mesesSinIngreso > 0 ? (
          <InsightCard
            label="Meses sin ingreso"
            icon={<AlertCircle size={14} />}
            value={`${mesesSinIngreso}`}
            sub={`de ${mensual.length} meses · ${peorMes ? `peor: ${peorMes.label} ($${fmtK(peorMes.total)})` : ''}`}
            tone="warning"
          />
        ) : (
          <InsightCard
            label="Meses con ingreso"
            icon={<Award size={14} />}
            value={`${conIngreso.length}/${mensual.length}`}
            sub={peorMes ? `Peor: ${peorMes.label} — $${fmtK(peorMes.total)}` : 'Todos los meses tuvieron ingreso'}
            tone="positive"
          />
        )}
      </div>

      {/* ── Evolución mensual ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">Evolución mensual</p>
        <p className="text-xs text-slate-400 mb-6">Línea punteada = tu promedio mensual del período</p>
        <BarsIngresos data={mensual} promedio={promMensual} />
      </div>

      {/* ── Fuentes de ingreso ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Banknote size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Fuentes de ingreso</p>
            <p className="text-xs text-slate-400">Distribución por cuenta donde se acreditó</p>
          </div>
        </div>
        {fuentes.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Sin ingresos en este período</p>
        ) : (
          <div className="space-y-2.5">
            {fuentes.map(f => (
              <div key={f.nombre}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-700 truncate flex-1">{f.nombre}</span>
                  <span className="text-xs text-slate-400 shrink-0">{f.count} mov</span>
                  <span className="text-sm font-bold text-slate-800 shrink-0">${fmt(f.total)}</span>
                  <span className="text-xs text-slate-400 w-12 text-right shrink-0">{f.pct.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: COL_INCOME }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Categorías de ingreso ── */}
      {categorias.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Tag size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Categorías de ingreso</p>
              <p className="text-xs text-slate-400">Cómo está etiquetada tu plata entrante</p>
            </div>
          </div>
          <div className="space-y-2">
            {categorias.map(c => (
              <div key={c.nombre} className="flex items-center gap-3 py-2 px-2 rounded-lg">
                <IconoCategoria icono={c.icono} size={14} />
                <span className="text-sm text-slate-700 truncate flex-1">{c.nombre}</span>
                <span className="text-xs text-slate-400 shrink-0">{c.count} mov</span>
                <div className="h-1 bg-slate-100 rounded-full w-32 max-w-[20vw] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: COL_INCOME }} />
                </div>
                <span className="text-sm font-bold text-slate-800 shrink-0 min-w-[80px] text-right">${fmt(c.total)}</span>
                <span className="text-xs text-slate-400 w-12 text-right shrink-0">{c.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top ingresos individuales ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">Top 10 ingresos individuales</p>
        <p className="text-xs text-slate-400 mb-5">Los ingresos de mayor monto en el período</p>
        {topIngresos.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Sin ingresos en este período</p>
        ) : (
          <div className="space-y-3">
            {topIngresos.map((m, i) => {
              const maxMonto = montoOf(topIngresos[0])
              const monto    = montoOf(m)
              const pct      = (monto / maxMonto) * 100
              return (
                <div key={m.id}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                    <IconoCategoria icono={m.categoria_icono} size={14} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 font-medium truncate">{m.detalle || 'Sin detalle'}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {m.categoria_nombre ?? 'Sin categoría'} · {formatFechaCorta(m.fecha)}
                        {m.cuenta_origen_nombre && ` · ${m.cuenta_origen_nombre}`}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-slate-800 shrink-0">${fmt(monto)}</span>
                  </div>
                  <div className="ml-10 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COL_INCOME }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bar chart con línea de promedio ─────────────────────────────────────────
function BarsIngresos({ data, promedio }: {
  data:     { mes: string; label: string; total: number }[]
  promedio: number
}) {
  const max   = Math.max(...data.map(d => d.total), promedio, 1)
  const BAR_H = 180

  if (data.length === 0)
    return <p className="text-center text-slate-400 text-sm py-10">Sin datos</p>

  const promY = BAR_H - (promedio / max) * BAR_H

  return (
    <div className="relative">
      <div className="flex items-end gap-2" style={{ height: BAR_H, paddingTop: 8 }}>
        {data.map(d => (
          <div key={d.mes} className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <div className="w-full flex items-end" style={{ height: BAR_H }}>
              <div
                className="w-full rounded-t-sm transition-all duration-500 mx-auto"
                style={{
                  height: d.total > 0 ? Math.max((d.total / max) * BAR_H, 3) : 2,
                  background: d.total > 0 ? COL_INCOME : '#e2e8f0',
                  maxWidth: '38px',
                }}
                title={`${d.label}: $${fmt(d.total)}`}
              />
            </div>
          </div>
        ))}
      </div>
      {/* Línea de promedio */}
      {promedio > 0 && (
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-slate-400 pointer-events-none"
          style={{ top: `${promY + 8}px` }}
        >
          <span className="absolute right-0 -top-5 text-[10px] text-slate-500 font-medium bg-white px-1.5 rounded">
            Prom $ {fmtK(promedio)}
          </span>
        </div>
      )}
      {/* Labels */}
      <div className="flex items-end gap-2 mt-2">
        {data.map(d => (
          <div key={d.mes} className="flex-1 min-w-0 flex flex-col items-center">
            <p className="text-[10px] text-slate-400 whitespace-nowrap">{d.label}</p>
            {d.total > 0 && (
              <p className="text-[9px] font-medium text-slate-600 mt-0.5">{fmtK(d.total)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
