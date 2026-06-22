'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Calendar, Award, Activity, Users, Target } from 'lucide-react'
import { InsightCard, HeroCard } from '@/components/analitica/insight-card'
import { fmt, fmtK, pctDelta } from '@/components/analitica/utils'
import {
  facturacionPorAnio,
  estadisticasFacturacion,
  estacionalidad,
  concentracionClientes,
  proyeccionAnual,
  facturasAgrupadasPorCliente,
  type FacturaEmitida,
} from '@/lib/monotributo'

const COL = '#1a6b5a'

export function AnaliticaFacturacionClient({
  facturas, limite,
}: {
  facturas: FacturaEmitida[]
  limite:   number | null
}) {
  // Años disponibles (desc) + opción "todos"
  const anios = useMemo(() => {
    const set = new Set(facturas.map(f => Number(f.fecha.slice(0, 4))).filter(Number.isFinite))
    return Array.from(set).sort((a, b) => b - a)
  }, [facturas])

  const anioActual = new Date().getFullYear()
  // Default: el año más reciente con datos (o "todos" si no hay)
  const [sel, setSel] = useState<number | 'todos'>(anios[0] ?? 'todos')

  const porAnio = useMemo(() => facturacionPorAnio(facturas), [facturas])

  // Stats del período seleccionado
  const stats = useMemo(
    () => estadisticasFacturacion(facturas, sel === 'todos' ? undefined : sel),
    [facturas, sel],
  )

  // Comparación con año anterior (solo si se eligió un año puntual)
  const comparacion = useMemo(() => {
    if (sel === 'todos') return null
    const idx = porAnio.findIndex(a => a.anio === sel)
    if (idx <= 0) return null
    return { actual: porAnio[idx].total, anterior: porAnio[idx - 1].total, anioAnt: porAnio[idx - 1].anio }
  }, [porAnio, sel])

  // Barras mensuales del año (12) o de toda la historia
  const mensual = useMemo(() => {
    const map: Record<string, number> = {}
    const fs = sel === 'todos' ? facturas : facturas.filter(f => Number(f.fecha.slice(0, 4)) === sel)
    if (sel === 'todos') {
      // Agregamos por YYYY-MM en orden cronológico
      fs.forEach(f => { const k = f.fecha.slice(0, 7); map[k] = (map[k] ?? 0) + f.monto })
      return Object.keys(map).sort().map(k => ({
        label: mesLabelCompacto(k),
        total: map[k],
      }))
    }
    // Año puntual: 12 meses fijos
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    for (let m = 1; m <= 12; m++) map[String(m).padStart(2, '0')] = 0
    fs.forEach(f => { const mm = f.fecha.slice(5, 7); if (map[mm] !== undefined) map[mm] += f.monto })
    return MESES.map((label, i) => ({ label, total: map[String(i + 1).padStart(2, '0')] }))
  }, [facturas, sel])

  const estacional   = useMemo(() => estacionalidad(facturas), [facturas])
  const concentracion = useMemo(
    () => concentracionClientes(sel === 'todos' ? facturas : facturas.filter(f => Number(f.fecha.slice(0, 4)) === sel)),
    [facturas, sel],
  )
  const porCliente = useMemo(
    () => facturasAgrupadasPorCliente(sel === 'todos' ? facturas : facturas.filter(f => Number(f.fecha.slice(0, 4)) === sel)),
    [facturas, sel],
  )
  const proyeccion = useMemo(
    () => (sel === anioActual ? proyeccionAnual(facturas, sel) : null),
    [facturas, sel, anioActual],
  )

  // Etiqueta de estabilidad según CV
  const cv = stats.coefVariacion
  const estLabel = cv < 20 ? 'Muy estable' : cv < 40 ? 'Estable' : cv < 70 ? 'Variable' : 'Muy variable'
  const estTone: 'positive' | 'neutral' | 'warning' | 'negative' =
    cv < 20 ? 'positive' : cv < 40 ? 'positive' : cv < 70 ? 'warning' : 'negative'

  const deltaPct = comparacion ? pctDelta(comparacion.actual, comparacion.anterior) : null

  return (
    <div className="space-y-6">

      {/* Selector de año */}
      <div className="flex items-center gap-2 flex-wrap">
        <ChipAnio active={sel === 'todos'} onClick={() => setSel('todos')}>Todos</ChipAnio>
        {anios.map(a => (
          <ChipAnio key={a} active={sel === a} onClick={() => setSel(a)}>{a}</ChipAnio>
        ))}
      </div>

      {/* Hero: total + comparación */}
      <HeroCard
        label={sel === 'todos' ? 'Facturado en total' : `Facturado en ${sel}`}
        value={`$${fmt(stats.total)}`}
        tone={deltaPct == null ? 'neutral' : deltaPct >= 0 ? 'positive' : 'negative'}
        sub={
          deltaPct != null
            ? `${deltaPct >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(deltaPct))}% vs ${comparacion!.anioAnt} ($${fmtK(comparacion!.anterior)})`
            : `${stats.count} factura${stats.count !== 1 ? 's' : ''} · ${stats.mesesConFactura} ${stats.mesesConFactura === 1 ? 'mes' : 'meses'} con actividad`
        }
        detail={
          proyeccion != null ? (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Proyección {sel}</p>
              <p className="text-2xl font-bold text-slate-700 tabular-nums">${fmtK(proyeccion)}</p>
              <p className="text-xs text-slate-400 mt-1">al ritmo actual</p>
            </div>
          ) : undefined
        }
      />

      {/* Cards de estabilidad */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InsightCard
          label="Promedio mensual"
          value={`$${fmtK(stats.promedioMensual)}`}
          sub={`${stats.mesesConFactura} ${stats.mesesConFactura === 1 ? 'mes' : 'meses'} con facturas`}
          icon={<Calendar size={15} />}
        />
        <InsightCard
          label="Mejor mes"
          value={stats.mejorMes ? `$${fmtK(stats.mejorMes.total)}` : '—'}
          sub={stats.mejorMes?.label ?? 'Sin datos'}
          tone="positive"
          icon={<Award size={15} />}
        />
        <InsightCard
          label="Mes más flojo"
          value={stats.peorMes ? `$${fmtK(stats.peorMes.total)}` : '—'}
          sub={stats.peorMes?.label ?? 'Sin datos'}
          icon={<TrendingDown size={15} />}
        />
        <InsightCard
          label="Estabilidad"
          value={estLabel}
          sub={`Variación ${Math.round(cv)}%`}
          tone={estTone}
          icon={<Activity size={15} />}
        />
      </div>

      {/* Barras mensuales */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">
          {sel === 'todos' ? 'Facturación mes a mes' : `Facturación mensual ${sel}`}
        </p>
        <p className="text-xs text-slate-400 mb-5">
          {sel === 'todos' ? 'Todo el histórico cargado' : 'Los 12 meses del año'}
        </p>
        <Barras data={mensual} promedio={stats.promedioMensual} />
      </div>

      {/* Comparación interanual (solo si 2+ años) */}
      {porAnio.length >= 2 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Comparación por año</p>
          <p className="text-xs text-slate-400 mb-5">Total facturado y crecimiento interanual</p>
          <div className="space-y-3">
            {[...porAnio].reverse().map(a => {
              const max = Math.max(...porAnio.map(x => x.total), 1)
              return (
                <div key={a.anio}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-sm font-semibold text-slate-700 w-12 shrink-0">{a.anio}</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-6 bg-slate-100 rounded-md overflow-hidden">
                        <div className="h-full rounded-md flex items-center justify-end px-2" style={{ width: `${(a.total / max) * 100}%`, background: COL, minWidth: '40px' }}>
                          <span className="text-[11px] font-semibold text-white whitespace-nowrap">${fmtK(a.total)}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs font-medium w-16 text-right shrink-0 ${a.crecimientoPct == null ? 'text-slate-300' : a.crecimientoPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {a.crecimientoPct == null ? '—' : `${a.crecimientoPct >= 0 ? '+' : ''}${Math.round(a.crecimientoPct)}%`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Estacionalidad (solo si hay datos en varios meses) */}
      {estacional.filter(m => m.total > 0).length >= 3 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Estacionalidad</p>
          <p className="text-xs text-slate-400 mb-5">En qué meses del año facturás más (promedio entre años)</p>
          <Barras
            data={estacional.map(m => ({ label: m.label, total: m.promedio }))}
            promedio={estacional.reduce((a, m) => a + m.promedio, 0) / 12}
          />
        </div>
      )}

      {/* Concentración de clientes */}
      {concentracion.topCliente && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-slate-700">Clientes</p>
            <span className="text-xs text-slate-400">{concentracion.totalClientes} en total</span>
          </div>
          <p className="text-xs text-slate-400 mb-5">Concentración de tu facturación {sel === 'todos' ? 'histórica' : `en ${sel}`}</p>

          {/* Riesgo de concentración */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Target size={12} />Cliente principal
              </p>
              <p className="text-lg font-bold text-slate-800 truncate">{concentracion.topCliente.cliente}</p>
              <p className={`text-xs font-medium ${concentracion.topCliente.pct >= 70 ? 'text-amber-600' : 'text-slate-500'}`}>
                {Math.round(concentracion.topCliente.pct)}% de tu facturación
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Users size={12} />Top 3 clientes
              </p>
              <p className="text-lg font-bold text-slate-800">{Math.round(concentracion.top3Pct)}%</p>
              <p className="text-xs text-slate-500">del total facturado</p>
            </div>
          </div>

          {concentracion.topCliente.pct >= 70 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
              Dependés bastante de un solo cliente ({Math.round(concentracion.topCliente.pct)}%). Diversificar te da más estabilidad si ese cliente baja el ritmo.
            </div>
          )}

          {/* Lista por cliente */}
          <div className="space-y-3">
            {porCliente.slice(0, 8).map((c, i) => {
              const max = porCliente[0].total
              return (
                <div key={c.cliente + i}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 font-medium truncate">{c.cliente}</p>
                      <p className="text-[11px] text-slate-400">{c.count} {c.count === 1 ? 'factura' : 'facturas'}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0">${fmt(c.total)}</span>
                  </div>
                  <div className="ml-8 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.total / max) * 100}%`, background: COL }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Relación con el límite (si hay año puntual + config) */}
      {limite && limite > 0 && sel !== 'todos' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Facturado {sel} vs límite de categoría</p>
          <p className="text-xs text-slate-400 mb-4">El límite es sobre 12 meses móviles — esto es una referencia anual</p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-slate-800 tabular-nums">${fmt(stats.total)}</span>
            <span className="text-sm text-slate-400">/ ${fmt(limite)}</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min((stats.total / limite) * 100, 100)}%`,
                background: stats.total / limite >= 0.95 ? '#dc2626' : stats.total / limite >= 0.8 ? '#d97706' : COL,
              }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">{Math.round((stats.total / limite) * 100)}% del tope anual</p>
        </div>
      )}
    </div>
  )
}

// ─── Chip de año ─────────────────────────────────────────────────────────────
function ChipAnio({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm px-3.5 py-1.5 rounded-full font-medium transition-colors ${
        active ? 'text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
      }`}
      style={active ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : undefined}
    >
      {children}
    </button>
  )
}

// ─── Barras genéricas con línea de promedio ──────────────────────────────────
function Barras({ data, promedio }: { data: { label: string; total: number }[]; promedio: number }) {
  const max = Math.max(...data.map(d => d.total), promedio, 1)
  const H = 160

  if (data.length === 0) return <p className="text-center text-slate-400 text-sm py-10">Sin datos</p>

  const promY = H - (promedio / max) * H

  return (
    <div className="relative">
      <div className="flex items-end gap-1.5" style={{ height: H }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 flex items-end" style={{ height: H }}>
            <div
              className="w-full rounded-t-sm mx-auto transition-all"
              style={{
                height: d.total > 0 ? Math.max((d.total / max) * H, 2) : 2,
                background: d.total > 0 ? COL : '#e2e8f0',
                maxWidth: '44px',
              }}
              title={`${d.label}: $${fmt(d.total)}`}
            />
          </div>
        ))}
      </div>
      {promedio > 0 && (
        <div className="absolute left-0 right-0 border-t border-dashed border-slate-300 pointer-events-none" style={{ top: `${promY}px` }}>
          <span className="absolute right-0 -top-4 text-[10px] text-slate-400 bg-white px-1">Prom ${fmtK(promedio)}</span>
        </div>
      )}
      <div className="flex items-start gap-1.5 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 text-center">
            <p className="text-[9px] text-slate-400 truncate">{d.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// 'YYYY-MM' → 'Mmm YY' compacto
function mesLabelCompacto(yyyymm: string): string {
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const m = Number(yyyymm.slice(5, 7))
  return `${MESES[m - 1] ?? '?'} ${yyyymm.slice(2, 4)}`
}
