// ─── /monotributo — Dashboard del régimen ────────────────────────────────────
// Server component. Carga config + facturas y renderiza:
//   - Si no hay config: empty state con CTA a configurar
//   - Si hay config: gauge facturación vs límite + costo mensual + proyección
//     + lista facturas recientes + agrupación por cliente
//
// Datos en /api/monotributo/* — esta page hace queries directas al cliente
// supabase autenticado para evitar round-trip extra (patrón usado en el resto
// de las páginas de la app).

import Link  from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Pencil, AlertTriangle, TrendingUp, Calendar, Settings, Info, RefreshCw, BarChart3 } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { DeleteButton } from '@/components/delete-button'
import { ImportarFacturaButton } from './importar-factura'
import {
  facturacionPeriodoEvaluacion,
  periodoEvaluacion,
  gaugeStatus,
  proyeccionMesesHastaLimite,
  facturasAgrupadasPorCliente,
  proximaRecategorizacion,
  generarAlertasMonotributo,
  type FacturaEmitida,
} from '@/lib/monotributo'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtFecha = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '')
}

// Formato DD/MM/YYYY — para mostrar el período igual que ARCA.
const fmtSlash = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

type Config = {
  categoria:                string
  actividad:                string
  limite_facturacion_anual: number
  costo_mensual:            number
  vigente_desde:            string
  gasto_fijo_id:            string | null
  notas:                    string | null
}

type GastoFijo = {
  id:              string
  nombre_gasto:    string
  monto_estimado:  number
  dia_vencimiento: number | null
}

export default async function MonotributoPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  // ── Queries en paralelo ──
  const [{ data: configRaw }, { data: facturasRaw }] = await Promise.all([
    supabase.from('monotributo_config').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('facturas_emitidas').select('*').eq('user_id', user.id).order('fecha', { ascending: false }),
  ])

  const config   = configRaw   as Config | null
  const facturas = (facturasRaw ?? []) as FacturaEmitida[]

  // ── Si no hay config, empty state con CTA ──
  if (!config) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <TrendingUp size={22} />
          </div>
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Configurá tu monotributo</h1>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Para arrancar, decinos tu categoría actual, el límite anual de facturación y el costo mensual.
            Después vas a poder cargar tus facturas emitidas y ver cuánto te falta para recategorizarte.
          </p>
          <Link
            href="/configuracion/monotributo"
            className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-lg font-medium"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            <Settings size={15} />
            Configurar
          </Link>
        </div>
      </div>
    )
  }

  // ── Cálculos del gauge ──
  // Período de evaluación = el que usa ARCA (alineado al semestre de recat),
  // NO 12 meses móviles. Ver lib/monotributo.ts sección 1.
  const periodo      = periodoEvaluacion()
  const facturado12  = facturacionPeriodoEvaluacion(facturas)
  const limite       = config.limite_facturacion_anual
  const pct          = limite > 0 ? Math.min((facturado12 / limite) * 100, 100) : 0
  const status       = gaugeStatus(facturado12, limite)
  const proyeccion   = proyeccionMesesHastaLimite(facturas, limite, facturado12)
  const porCliente   = facturasAgrupadasPorCliente(facturas)
  const recientes    = facturas.slice(0, 10)

  // ── Asistente: alertas + próxima recategorización ──
  const recat        = proximaRecategorizacion()
  const alertas      = generarAlertasMonotributo(
    { categoria: config.categoria, limite_facturacion_anual: limite, costo_mensual: config.costo_mensual, actividad: config.actividad as 'servicios' | 'venta_bienes' },
    facturas,
  )

  // ── Próximo vencimiento del gasto fijo asociado ──
  let gastoFijo: GastoFijo | null = null
  if (config.gasto_fijo_id) {
    const { data } = await supabase
      .from('gastos_fijos')
      .select('id, nombre_gasto, monto_estimado, dia_vencimiento')
      .eq('id', config.gasto_fijo_id)
      .eq('user_id', user.id)
      .maybeSingle()
    gastoFijo = data as GastoFijo | null
  }

  // ── Tonos según status del gauge ──
  const statusColor = {
    ok:      '#1a6b5a',
    warning: '#d97706',
    danger:  '#dc2626',
  }[status]
  const statusLabel = {
    ok:      'En rango',
    warning: 'Cerca del límite',
    danger:  'Riesgo de recategorización',
  }[status]

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Monotributo</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Categoría <strong>{config.categoria}</strong> · {config.actividad === 'servicios' ? 'Servicios' : 'Venta de bienes'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/monotributo/analitica"
            className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <BarChart3 size={14} />Analítica
          </Link>
          <Link
            href="/configuracion/monotributo"
            className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <Settings size={14} />Config
          </Link>
          <ImportarFacturaButton />
          <Link
            href="/monotributo/nueva"
            className="inline-flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium whitespace-nowrap"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            <Plus size={15} />Nueva factura
          </Link>
        </div>
      </div>

      {/* Asistente: alertas activas. Solo se muestra si hay algo que decir. */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => {
            const tone = {
              danger:  { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800',    icon: 'text-red-500',    Icon: AlertTriangle },
              warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  icon: 'text-amber-500',  Icon: AlertTriangle },
              info:    { bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-800',    icon: 'text-sky-500',    Icon: Info },
            }[a.nivel]
            const Icon = tone.Icon
            return (
              <div key={i} className={`flex items-start gap-3 ${tone.bg} border ${tone.border} rounded-xl p-4`}>
                <Icon size={16} className={`shrink-0 mt-0.5 ${tone.icon}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${tone.text}`}>{a.titulo}</p>
                  <p className={`text-xs mt-0.5 ${tone.text} opacity-90`}>{a.detalle}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Gauge facturación del período de evaluación vs límite */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-sm font-semibold text-slate-700">Facturado del período</p>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${statusColor}15`, color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          {fmtSlash(periodo.desde)} al {fmtSlash(periodo.hasta)} · lo que ARCA evalúa para la recategorización de {periodo.recategorizacion.mes}
        </p>

        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold text-slate-800 tabular-nums">${fmt(facturado12)}</span>
          <span className="text-sm text-slate-400">/ ${fmt(limite)}</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: statusColor }} />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {pct.toFixed(1)}% del límite · te quedan ${fmt(Math.max(limite - facturado12, 0))}
        </p>

        {status === 'danger' && (
          <div className="mt-4 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>Estás muy cerca o por encima del límite. Considerá recategorizarte para evitar problemas con AFIP.</span>
          </div>
        )}
      </div>

      {/* Costo mensual + Proyección + Recategorización — 3 cards en grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Costo mensual */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Costo mensual</p>
          <p className="text-2xl font-bold text-slate-800 tabular-nums">${fmt(config.costo_mensual)}</p>
          {gastoFijo ? (
            <p className="text-xs text-slate-500 mt-2">
              <Calendar size={11} className="inline mr-1" />
              Día {gastoFijo.dia_vencimiento ?? '—'} · <Link href="/gastos-fijos" className="text-emerald-600 hover:underline">{gastoFijo.nombre_gasto}</Link>
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-2">
              Sin gasto fijo vinculado · <Link href="/configuracion/monotributo" className="text-emerald-600 hover:underline">vincular</Link>
            </p>
          )}
        </div>

        {/* Proyección al límite */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Proyección al límite</p>
          {proyeccion === null ? (
            <>
              <p className="text-2xl font-bold text-slate-300">—</p>
              <p className="text-xs text-slate-400 mt-2">Necesito más datos de los últimos 3 meses</p>
            </>
          ) : proyeccion === 0 ? (
            <>
              <p className="text-2xl font-bold text-red-600">Ya superado</p>
              <p className="text-xs text-slate-500 mt-2">Estás por encima del límite</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">~{proyeccion} {proyeccion === 1 ? 'mes' : 'meses'}</p>
              <p className="text-xs text-slate-500 mt-2">A este ritmo (promedio últimos 3 meses)</p>
            </>
          )}
        </div>

        {/* Próxima recategorización */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Próxima recategorización</p>
          <p className="text-2xl font-bold text-slate-800 capitalize">{recat.mes}</p>
          <p className="text-xs text-slate-500 mt-2">
            <RefreshCw size={11} className="inline mr-1" />
            {recat.diasRestantes === 0 ? 'Es hoy' : `En ${recat.diasRestantes} días`} · nuevo costo desde {recat.primerPagoMes}
          </p>
        </div>
      </div>

      {/* Facturas recientes */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-sm font-semibold text-slate-700">Facturas recientes</p>
          <span className="text-xs text-slate-400">{facturas.length} en total</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Las últimas 10 emitidas</p>

        {recientes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400 mb-3">Todavía no cargaste facturas</p>
            <Link
              href="/monotributo/nueva"
              className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:underline"
            >
              <Plus size={14} />Cargar la primera
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recientes.map(f => (
              <div key={f.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{f.cliente}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {fmtFecha(f.fecha)}
                    {f.concepto ? ` · ${f.concepto}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0">${fmt(f.monto)}</span>
                <Link
                  href={`/monotributo/${f.id}/editar`}
                  className="p-2 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                  title="Editar"
                >
                  <Pencil size={14} />
                </Link>
                <DeleteButton
                  endpoint={`/api/monotributo/facturas/${f.id}`}
                  redirectTo="/monotributo"
                  label={`factura de ${f.cliente}`}
                  description="La factura se eliminará permanentemente."
                  variant="icon"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Por cliente */}
      {porCliente.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Facturación por cliente</p>
          <p className="text-xs text-slate-400 mb-5">Acumulado histórico, ordenado por monto</p>
          <div className="space-y-3">
            {porCliente.map((c, i) => {
              const maxTotal = porCliente[0].total
              const pctBar   = (c.total / maxTotal) * 100
              return (
                <div key={c.cliente + i}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xs text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 font-medium truncate">{c.cliente}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {c.count} {c.count === 1 ? 'factura' : 'facturas'} · última el {fmtFecha(c.ultimaFecha)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0">${fmt(c.total)}</span>
                  </div>
                  <div className="ml-8 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pctBar}%`, background: '#1a6b5a' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
