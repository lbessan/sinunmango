'use client'

// ─── Tab Flujo ───────────────────────────────────────────────────────────────
//
// Visualización del flujo de la plata:
//   1. Period selector
//   2. Hero: recibido / gastado / neto
//   3. Sankey: income sources → categorías
//   4. Cash flow waterfall
//   5. Runway: cuántos días te alcanza el ahorro a tu ritmo de gasto

import { useState, useMemo } from 'react'
import { Banknote, ShoppingBag, Wallet, Clock } from 'lucide-react'
import { HeroCard, InsightCard } from './insight-card'
import { PeriodSelector } from './period-selector'
import { SankeyFlujo }    from './sankey-flujo'
import { WaterfallFlujo } from './waterfall-flujo'
import {
  fmt, fmtK, montoOf, parseFecha, diasEntre, getDateRange,
  type MovAnalitica, type Preset,
} from './utils'

export function TabFlujo({ movimientos }: { movimientos: MovAnalitica[] }) {
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

  const movsPeriodo = useMemo(() =>
    movimientos.filter(m => {
      const f = parseFecha(m.fecha)
      return f >= desde && f <= hasta
    }),
    [movimientos, desde, hasta]
  )

  const ingresos = movsPeriodo.filter(m => m.tipo_movimiento === 'Ingreso')
  const gastos   = movsPeriodo.filter(m => m.tipo_movimiento === 'Gasto')

  const totalIngresos = ingresos.reduce((a, m) => a + montoOf(m), 0)
  const totalGastos   = gastos.reduce((a, m) => a + montoOf(m), 0)
  const neto          = totalIngresos - totalGastos

  const diasPeriodo = diasEntre(desde, hasta)
  const gastoPromedioDiario = totalGastos / diasPeriodo

  // Runway: si el neto del período es positivo (ahorraste), ¿cuántos días te
  // alcanzarían esos ahorros al ritmo de gasto actual sin nuevos ingresos?
  const runwayDias = gastoPromedioDiario > 0 && neto > 0
    ? Math.round(neto / gastoPromedioDiario)
    : null

  const heroValue = `${neto >= 0 ? '+' : '-'}$${fmt(Math.abs(neto))}`
  const heroSub   = neto >= 0
    ? `Ahorraste $${fmt(neto)} del total que entró`
    : `Tu déficit fue $${fmt(-neto)} — saliste de ahorros previos`

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
        label={neto >= 0 ? 'Resultado del período' : 'Resultado del período (déficit)'}
        value={heroValue}
        sub={heroSub}
        tone={neto >= 0 ? 'positive' : 'negative'}
        detail={
          <div className="grid grid-cols-2 lg:grid-cols-2 gap-6 lg:gap-4 lg:min-w-[280px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Ingresos</p>
              <p className="text-lg font-bold text-emerald-600">${fmt(totalIngresos)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Gastos</p>
              <p className="text-lg font-bold text-red-600">${fmt(totalGastos)}</p>
            </div>
          </div>
        }
      />

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InsightCard
          label="Ingresos / día"
          icon={<Banknote size={14} />}
          value={`$${fmtK(totalIngresos / diasPeriodo)}`}
          sub={`Promedio en ${diasPeriodo} días`}
          tone="positive"
        />
        <InsightCard
          label="Gastos / día"
          icon={<ShoppingBag size={14} />}
          value={`$${fmtK(gastoPromedioDiario)}`}
          sub={`Promedio en ${diasPeriodo} días`}
          tone="negative"
        />
        {runwayDias !== null ? (
          <InsightCard
            label="Runway"
            icon={<Clock size={14} />}
            value={`${runwayDias} días`}
            sub={`A tu ritmo de gasto, lo ahorrado en este período te alcanza ${runwayDias} días`}
            tone={runwayDias >= 30 ? 'positive' : runwayDias >= 14 ? 'warning' : 'negative'}
          />
        ) : (
          <InsightCard
            label="Runway"
            icon={<Wallet size={14} />}
            value="—"
            sub={neto < 0 ? 'Período en déficit · no se calcula runway' : 'Sin gastos para calcular ritmo'}
            tone="neutral"
          />
        )}
      </div>

      {/* ── Sankey ── */}
      <SankeyFlujo movs={movsPeriodo} />

      {/* ── Waterfall ── */}
      <WaterfallFlujo movs={movsPeriodo} />
    </div>
  )
}
