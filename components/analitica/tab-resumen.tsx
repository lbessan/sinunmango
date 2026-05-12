'use client'

import { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Calendar,
  Award, Target, Activity, Hash,
} from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { InsightCard, HeroCard } from './insight-card'
import { Sparkline } from './sparkline'
import { PeriodSelector } from './period-selector'
import { AIInsightCard } from './ai-insight-card'
import {
  fmt, fmtK, formatFechaCorta, getDateRange, parseFecha,
  type MovAnalitica, type Preset,
} from './utils'
import { computeInsights } from './insights'

export function TabResumen({
  movimientos,
  hasProAccess,
}: {
  movimientos:  MovAnalitica[]
  hasProAccess: boolean
}) {
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

  const insights = useMemo(() => computeInsights(movimientos, desde, hasta), [movimientos, desde, hasta])

  // ── Hero narrative ──
  const heroNeto    = insights.neto
  const heroPositive = heroNeto >= 0
  const heroValue   = `${heroPositive ? '+' : '-'}$${fmt(Math.abs(heroNeto))}`
  const heroLabel   = heroPositive ? 'Ahorraste en el período' : 'Gastaste de más en el período'

  // Narrativa de comparación
  let heroSub: string
  if (insights.netoDeltaPct !== null) {
    const delta = Math.round(insights.netoDeltaPct)
    const mejor = (heroPositive && delta > 0) || (!heroPositive && delta < 0)
    heroSub = `${delta >= 0 ? '+' : ''}${delta}% vs período anterior · ${mejor ? 'tendencia positiva' : 'tendencia a corregir'}`
  } else {
    heroSub = 'Sin período anterior para comparar'
  }

  return (
    <div className="space-y-6">
      {/* ── Period selector ── */}
      <PeriodSelector
        preset={preset}
        customDesde={customDesde}
        customHasta={customHasta}
        onPresetChange={setPreset}
        onCustomDesdeChange={setCustomDesde}
        onCustomHastaChange={setCustomHasta}
      />

      {/* ── AI Insight (Pro feature) ── */}
      <AIInsightCard
        movimientos={movimientos}
        desde={desde}
        hasta={hasta}
        hasProAccess={hasProAccess}
      />

      {/* ── Hero ── */}
      <HeroCard
        label={heroLabel}
        value={heroValue}
        sub={heroSub}
        tone={heroPositive ? 'positive' : 'negative'}
        detail={
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-6 lg:gap-2 lg:min-w-[200px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Tasa de ahorro</p>
              <p className={`text-xl font-bold ${insights.savingsRate >= 20 ? 'text-emerald-600' : insights.savingsRate >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                {Math.round(insights.savingsRate)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Movimientos</p>
              <p className="text-xl font-bold text-slate-700">{insights.movimientosCount}</p>
            </div>
          </div>
        }
      />

      {/* ── Grid de insight cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Gasto promedio diario */}
        <InsightCard
          label="Gasto promedio diario"
          icon={<Activity size={14} />}
          value={`$${fmtK(insights.gastoPromedioDiario)}`}
          sub={`${insights.diasConGastos} de ${insights.diasPeriodo} días con gastos`}
          tone="neutral"
          footer={
            insights.gastosDiariosUltimos30.length >= 2 ? (
              <Sparkline data={insights.gastosDiariosUltimos30} width={200} height={32} color="#dc2626" />
            ) : null
          }
        />

        {/* Ingresos vs gastos comparativa */}
        <InsightCard
          label="Ingresos del período"
          icon={<TrendingUp size={14} />}
          value={`$${fmtK(insights.totalIngresos)}`}
          sub={insights.totalGastos > 0
            ? `Por cada $100 que entran, gastás $${Math.round((insights.totalGastos / Math.max(insights.totalIngresos, 1)) * 100)}`
            : 'Sin gastos para comparar'}
          tone="positive"
        />

        {/* Gastos del período */}
        <InsightCard
          label="Gastos del período"
          icon={<TrendingDown size={14} />}
          value={`$${fmtK(insights.totalGastos)}`}
          sub={
            insights.gastosDeltaPct !== null
              ? `${insights.gastosDeltaPct >= 0 ? '+' : ''}${Math.round(insights.gastosDeltaPct)}% vs período anterior`
              : 'Sin período anterior'
          }
          tone={insights.gastosDeltaPct !== null && insights.gastosDeltaPct > 5 ? 'negative' : 'neutral'}
        />

        {/* Día más caro */}
        {insights.diaMasCaro ? (
          <InsightCard
            label="Día más caro"
            icon={<Calendar size={14} />}
            value={`$${fmtK(insights.diaMasCaro.total)}`}
            sub={
              <>
                <span className="block">{formatFechaCorta(insights.diaMasCaro.fecha)}</span>
                {insights.diaMasCaro.topDetalle && (
                  <span className="block text-slate-400 truncate">↳ {insights.diaMasCaro.topDetalle}</span>
                )}
              </>
            }
            tone="warning"
          />
        ) : (
          <InsightCard label="Día más caro" value="—" sub="Sin gastos" tone="neutral" icon={<Calendar size={14} />} />
        )}

        {/* Categoría que más creció */}
        {insights.catTopCrecimiento ? (
          <InsightCard
            label="Mayor crecimiento"
            icon={<TrendingUp size={14} />}
            value={`+${Math.round(insights.catTopCrecimiento.deltaPct)}%`}
            sub={
              <span className="flex items-center gap-1.5">
                <IconoCategoria icono={insights.catTopCrecimiento.icono} size={12} />
                <span className="truncate">
                  {insights.catTopCrecimiento.nombre}: ${fmt(insights.catTopCrecimiento.actual)} (antes ${fmt(insights.catTopCrecimiento.anterior)})
                </span>
              </span>
            }
            tone="negative"
          />
        ) : (
          <InsightCard label="Mayor crecimiento" value="—" sub="Sin comparación disponible" tone="neutral" icon={<TrendingUp size={14} />} />
        )}

        {/* Racha sin gastos */}
        {insights.rachaSinGastos ? (
          <InsightCard
            label="Racha sin gastos"
            icon={<Award size={14} />}
            value={`${insights.rachaSinGastos.dias} días`}
            sub={`${formatFechaCorta(insights.rachaSinGastos.desde)} → ${formatFechaCorta(insights.rachaSinGastos.hasta)}`}
            tone="positive"
          />
        ) : (
          <InsightCard label="Racha sin gastos" value="—" sub="No hubo días sin gastos consecutivos" tone="neutral" icon={<Award size={14} />} />
        )}

        {/* Run-rate del mes */}
        {insights.runRateMes ? (
          <InsightCard
            label="Proyección fin de mes"
            icon={<Target size={14} />}
            value={`$${fmtK(insights.runRateMes.proyectado)}`}
            sub={`Llevás $${fmt(insights.runRateMes.gastadoMTD)} en ${insights.runRateMes.diasTranscurridos}/${insights.runRateMes.diasDelMes} días`}
            tone="warning"
          />
        ) : (
          <InsightCard
            label="Proyección fin de mes"
            icon={<Target size={14} />}
            value="—"
            sub="Disponible solo si el período incluye el mes actual"
            tone="neutral"
          />
        )}

        {/* Categorías activas / Movimientos */}
        <InsightCard
          label="Diversidad de gastos"
          icon={<Hash size={14} />}
          value={`${insights.categoriasCount} categorías`}
          sub={`${insights.movimientosCount} movimientos en total`}
          tone="neutral"
        />
      </div>

      {/* ── Hint ── */}
      <p className="text-center text-xs text-slate-400 pt-2">
        Esta es la vista <strong>Resumen</strong>. Para análisis detallado, abrí las pestañas <em>Gastos</em>, <em>Ingresos</em>, <em>Flujo</em>, <em>Patrones</em> o <em>Predicciones</em>.
      </p>
    </div>
  )
}
