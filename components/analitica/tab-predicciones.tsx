'use client'

// ─── Tab Predicciones ────────────────────────────────────────────────────────
//
// Mirada hacia adelante basada en tu comportamiento histórico:
//   1. Hero: proyección de ahorro/déficit a 12 meses
//   2. Run-rate del mes en curso (gastado MTD → proyección fin de mes)
//   3. Cards de proyección a 3 / 6 / 12 meses
//   4. Top categorías con su proyección anual
//   5. (Pro) Insight AI con recomendaciones de optimización

import { useMemo } from 'react'
import {
  TrendingUp, Target, Calendar, AlertTriangle,
  TrendingDown, Minus,
} from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { HeroCard, InsightCard } from './insight-card'
import { fmt, fmtK, type MovAnalitica } from './utils'
import {
  calcularPromediosMensuales,
  calcularRunRate,
  calcularProyeccionesPorCategoria,
} from './predicciones-utils'

export function TabPredicciones({ movimientos }: { movimientos: MovAnalitica[] }) {
  const promedios = useMemo(() => calcularPromediosMensuales(movimientos, 6), [movimientos])
  const runRate   = useMemo(() => calcularRunRate(movimientos), [movimientos])
  const proyCats  = useMemo(() => calcularProyeccionesPorCategoria(movimientos, 6), [movimientos])

  // Hero: 12 meses de proyección — puramente conductual (basado en tu promedio histórico)
  const proyAhorroAnual = promedios.netoMensualProm * 12

  // Run-rate comparado con promedio histórico
  const rrVsProm = promedios.gastoMensualProm > 0
    ? ((runRate.proyectadoGasto - promedios.gastoMensualProm) / promedios.gastoMensualProm) * 100
    : null

  if (promedios.mesesConsiderados === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
        <p className="text-sm text-slate-500">Necesitás al menos un mes cerrado de datos para ver predicciones</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Hero: proyección anual basada en comportamiento histórico ── */}
      <HeroCard
        label={proyAhorroAnual >= 0 ? 'Proyección a 12 meses' : 'Proyección a 12 meses (déficit)'}
        value={`${proyAhorroAnual >= 0 ? '+' : '-'}$${fmt(Math.abs(Math.round(proyAhorroAnual)))}`}
        sub={`Si mantenés tu comportamiento de los últimos ${promedios.mesesConsiderados} meses · ingreso $${fmtK(promedios.ingresoMensualProm)}/mes · gasto $${fmtK(promedios.gastoMensualProm)}/mes`}
        tone={proyAhorroAnual >= 0 ? 'positive' : 'negative'}
        detail={
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-6 lg:gap-2 lg:min-w-[200px]">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Ahorro promedio</p>
              <p className={`text-xl font-bold ${promedios.netoMensualProm >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {promedios.netoMensualProm >= 0 ? '+' : '-'}${fmt(Math.abs(Math.round(promedios.netoMensualProm)))}/mes
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Base</p>
              <p className="text-xs text-slate-500">Últimos {promedios.mesesConsiderados} meses cerrados</p>
            </div>
          </div>
        }
      />

      {/* ── Run-rate del mes en curso ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Calendar size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Run-rate del mes en curso</p>
            <p className="text-xs text-slate-400">
              Llevás {runRate.diasTranscurridos} de {runRate.diasTotalesMes} días del mes
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Gastado hasta hoy</p>
            <p className="text-xl font-bold text-slate-800">${fmt(Math.round(runRate.gastadoMTD))}</p>
            <p className="text-[11px] text-slate-500 mt-1">${fmt(Math.round(runRate.gastadoMTD / runRate.diasTranscurridos))}/día promedio</p>
          </div>

          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest mb-1">Proyección fin de mes</p>
            <p className="text-xl font-bold text-amber-700">${fmt(Math.round(runRate.proyectadoGasto))}</p>
            {rrVsProm !== null && (
              <p className={`text-[11px] font-medium mt-1 flex items-center gap-1 ${
                Math.abs(rrVsProm) < 8 ? 'text-slate-500' :
                rrVsProm > 0 ? 'text-red-600' : 'text-emerald-600'
              }`}>
                {Math.abs(rrVsProm) < 8 ? <Minus size={10} /> : rrVsProm > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {rrVsProm >= 0 ? '+' : ''}{Math.round(rrVsProm)}% vs tu promedio
              </p>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Neto del mes (proyectado)</p>
            <p className={`text-xl font-bold ${runRate.proyectadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {runRate.proyectadoNeto >= 0 ? '+' : '-'}${fmt(Math.abs(Math.round(runRate.proyectadoNeto)))}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">${fmt(Math.round(runRate.ingresadoMTD))} ingresado MTD</p>
          </div>
        </div>

        {/* Barra de progreso del mes */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Inicio del mes</span>
            <span>{Math.round((runRate.diasTranscurridos / runRate.diasTotalesMes) * 100)}% transcurrido</span>
            <span>Fin del mes</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-500"
              style={{ width: `${(runRate.diasTranscurridos / runRate.diasTotalesMes) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Proyecciones 3/6/12 meses (basadas en promedio histórico) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ProjCard label="A 3 meses"  meses={3}  promedios={promedios} />
        <ProjCard label="A 6 meses"  meses={6}  promedios={promedios} />
        <ProjCard label="A 12 meses" meses={12} promedios={promedios} />
      </div>

      {/* ── Top categorías con proyección anual ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Target size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Proyección anual por categoría</p>
            <p className="text-xs text-slate-400">
              Basado en tu promedio mensual de los últimos {promedios.mesesConsiderados} meses
            </p>
          </div>
        </div>

        {proyCats.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Sin categorías con historial suficiente</p>
        ) : (
          <div className="space-y-2">
            {proyCats.slice(0, 10).map(c => {
              const maxProy = proyCats[0].proyAnual
              const pct = (c.proyAnual / maxProy) * 100

              const deltaIcon = c.delta === null ? <Minus size={11} className="text-slate-300" />
                : c.delta > 10  ? <TrendingUp size={11} className="text-red-500" />
                : c.delta < -10 ? <TrendingDown size={11} className="text-emerald-600" />
                : <Minus size={11} className="text-slate-400" />

              const deltaText = c.delta === null
                ? 'sin datos'
                : Math.abs(c.delta) < 5
                  ? 'estable'
                  : `${c.delta >= 0 ? '+' : ''}${Math.round(c.delta)}% último mes`

              return (
                <div key={c.nombre} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <IconoCategoria icono={c.icono} size={14} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-700 truncate">{c.nombre}</span>
                      <span className="text-sm font-bold text-slate-800 shrink-0">${fmt(Math.round(c.proyAnual))}/año</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="h-1 bg-slate-100 rounded-full flex-1 max-w-[200px] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#6366f1' }} />
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">${fmtK(c.mensualProm)}/mes</span>
                      </div>
                      <span className="flex items-center gap-0.5 text-[11px] font-medium text-slate-500 shrink-0">
                        {deltaIcon}{deltaText}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 leading-relaxed">
          Las proyecciones asumen que tu comportamiento se mantiene constante. Cambios estacionales,
          gastos únicos grandes (vacaciones, electrónicos) o nuevos ingresos pueden mover los números
          significativamente. Usá esto como referencia, no como verdad absoluta.
        </p>
      </div>

    </div>
  )
}

function ProjCard({
  label,
  meses,
  promedios,
}: {
  label:     string
  meses:     number
  promedios: { ingresoMensualProm: number; gastoMensualProm: number; netoMensualProm: number }
}) {
  const totalIng = promedios.ingresoMensualProm * meses
  const totalGas = promedios.gastoMensualProm   * meses
  const totalNet = promedios.netoMensualProm    * meses

  return (
    <InsightCard
      label={label}
      icon={<TrendingUp size={14} />}
      value={`${totalNet >= 0 ? '+' : '-'}$${fmtK(Math.abs(totalNet))}`}
      sub={
        <>
          <span className="block">Ingreso proy: ${fmtK(totalIng)}</span>
          <span className="block">Gasto proy: ${fmtK(totalGas)}</span>
        </>
      }
      tone={totalNet >= 0 ? 'positive' : 'negative'}
    />
  )
}
