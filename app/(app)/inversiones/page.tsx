import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, TrendingUp, TrendingDown, Clock, ChevronRight } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'

export const dynamic = 'force-dynamic'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtPct = (n: number) =>
  (n >= 0 ? '+' : '') + n.toFixed(1) + '%'

type Inversion = {
  id: string
  tipo: string
  nombre: string | null
  fecha_inicio: string
  fecha_vencimiento: string | null
  moneda: string
  capital_inicial: number
  valor_actual: number | null
  estado: string
  datos: Record<string, unknown>
  notas: string | null
}

const TIPO_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  plazo_fijo:     { emoji: '🏦', label: 'Plazo Fijo',      color: '#1d4ed8' },
  plazo_fijo_uva: { emoji: '🏦', label: 'Plazo Fijo UVA',  color: '#7c3aed' },
  fci:            { emoji: '📊', label: 'FCI',             color: '#0891b2' },
  dolar:          { emoji: '💵', label: 'Dólar físico',     color: '#16a34a' },
  crypto:         { emoji: '₿',  label: 'Crypto',          color: '#f59e0b' },
  cedear:         { emoji: '🌎', label: 'CEDEAR',          color: '#059669' },
  accion:         { emoji: '📉', label: 'Acción',          color: '#dc2626' },
  bono:           { emoji: '📜', label: 'Bono soberano',   color: '#6d28d9' },
  on:             { emoji: '🏢', label: 'ON corporativa',  color: '#0f766e' },
  otro:           { emoji: '➕', label: 'Otro',            color: '#64748b' },
}

function diasHastaVencimiento(fecha: string): number {
  const hoy    = new Date(); hoy.setHours(0, 0, 0, 0)
  const vence  = new Date(fecha + 'T12:00:00')
  return Math.round((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function labelVencimiento(fecha: string | null): { texto: string; color: string } | null {
  if (!fecha) return null
  const dias = diasHastaVencimiento(fecha)
  if (dias < 0)  return { texto: 'Vencido', color: '#dc2626' }
  if (dias === 0) return { texto: 'Vence hoy', color: '#dc2626' }
  if (dias <= 3)  return { texto: `Vence en ${dias}d`, color: '#d97706' }
  if (dias <= 10) return { texto: `${dias} días`, color: '#ca8a04' }
  return { texto: `${dias} días`, color: '#64748b' }
}

function nombreDisplay(inv: Inversion): string {
  if (inv.nombre) return inv.nombre
  const d = inv.datos
  if (inv.tipo === 'plazo_fijo' || inv.tipo === 'plazo_fijo_uva') return `PF ${d.banco ?? ''}`
  if (inv.tipo === 'fci')    return `${d.nombre_fondo ?? 'FCI'}`
  if (inv.tipo === 'dolar')  return `Dólar ${d.tipo_cotizacion ?? 'físico'} — US$${fmt(Number(d.cantidad_usd ?? 0))}`
  if (inv.tipo === 'crypto') return `${d.moneda_cripto ?? 'Crypto'} — ${d.exchange ?? ''}`
  if (inv.tipo === 'cedear' || inv.tipo === 'accion') return `${d.ticker ?? '—'} × ${d.cantidad ?? '?'}`
  if (inv.tipo === 'bono' || inv.tipo === 'on') return `${d.ticker ?? '—'} VN ${fmt(Number(d.cantidad_vn ?? 0))} USD`
  return TIPO_LABELS[inv.tipo]?.label ?? inv.tipo
}

function subDisplay(inv: Inversion): string {
  const d = inv.datos
  if (inv.tipo === 'plazo_fijo') return `TNA ${d.tna ?? '—'}% · ${d.plazo_dias ?? '—'} días`
  if (inv.tipo === 'plazo_fijo_uva') return `Spread ${d.tna ?? '—'}% sobre UVA`
  if (inv.tipo === 'fci')    return `${d.administradora ?? ''} · ${d.tipo_fci ?? ''}`
  if (inv.tipo === 'dolar')  return `Compra: $${fmt(Number(d.cotizacion_compra ?? 0))} ARS/USD`
  if (inv.tipo === 'crypto') return `${d.tipo_crypto ?? ''} · ${d.exchange ?? ''}`
  if (inv.tipo === 'cedear') return `Ratio ${d.ratio ?? '?'} · Broker: ${d.broker ?? '—'}`
  if (inv.tipo === 'accion') return `Broker: ${d.broker ?? '—'}`
  if (inv.tipo === 'bono')   return `Legislación: ${d.legislacion ?? '—'} · TIR ${d.tir_compra ?? '—'}%`
  if (inv.tipo === 'on')     return `Emisor: ${d.emisor ?? '—'} · TIR ${d.tir_compra ?? '—'}%`
  return ''
}

export default async function InversionesPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: inversiones }, { data: params }] = await Promise.all([
    supabase
      .from('inversiones')
      .select('*')
      .eq('user_id', user.id)
      .neq('estado', 'liquidado')
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('parametros')
      .select('valor')
      .eq('id', 'Dolar_Tarjeta_BNA')
      .eq('user_id', user.id)
      .single(),
  ])

  const dolar = params?.valor ?? 1410
  const inv   = (inversiones ?? []) as Inversion[]

  // ── Totales ────────────────────────────────────────────────────────────────
  const toARS = (i: Inversion, usarActual = false) => {
    const monto = usarActual ? (i.valor_actual ?? i.capital_inicial) : i.capital_inicial
    return i.moneda === 'USD' ? monto * dolar : monto
  }

  const totalCapital = inv.reduce((s, i) => s + toARS(i, false), 0)
  const totalActual  = inv.reduce((s, i) => s + toARS(i, true), 0)
  const totalGanancia = totalActual - totalCapital
  const pctGlobal = totalCapital > 0 ? ((totalGanancia / totalCapital) * 100) : 0

  // ── Agrupado por tipo ──────────────────────────────────────────────────────
  const porTipo: Record<string, Inversion[]> = {}
  for (const i of inv) {
    const g = i.tipo === 'plazo_fijo_uva' ? 'plazo_fijo' : i.tipo
    if (!porTipo[g]) porTipo[g] = []
    porTipo[g].push(i)
  }

  // ── Próximos vencimientos (30 días) ────────────────────────────────────────
  const proximos = inv
    .filter(i => i.fecha_vencimiento && diasHastaVencimiento(i.fecha_vencimiento) <= 30 && diasHastaVencimiento(i.fecha_vencimiento) >= 0)
    .sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''))

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-800">Inversiones</h1>
          <p className="text-xs text-slate-400 mt-0.5">{inv.length} posición{inv.length !== 1 ? 'es' : ''} activa{inv.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/inversiones/nueva"
          className="inline-flex items-center gap-2 text-sm text-white px-3 sm:px-4 py-2.5 rounded-xl font-medium shrink-0 whitespace-nowrap"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva inversión</span>
          <span className="sm:hidden">Nueva</span>
        </Link>
      </div>

      {inv.length === 0 ? (
        /* Empty state */
        <div className="bg-white rounded-2xl border border-slate-100 py-20 text-center">
          <p className="text-4xl mb-4">📈</p>
          <p className="text-slate-700 font-semibold text-lg mb-2">Todavía no tenés inversiones cargadas</p>
          <p className="text-slate-400 text-sm mb-6">Podés registrar plazos fijos, FCI, dólares, crypto y más.</p>
          <Link
            href="/inversiones/nueva"
            className="inline-flex items-center gap-2 text-sm text-white px-6 py-3 rounded-xl font-medium"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            <Plus size={16} /> Cargar primera inversión
          </Link>
        </div>
      ) : (
        <>
          {/* ── Resumen global ─────────────────────────────────────────────── */}
          {/* grid-cols-3 fijo desbordaba con montos AR de 8 dígitos en mobile.
              Colapsa a 1 columna debajo de sm. tabular-nums + min-w-0 evitan
              jitter al cambiar saldo. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Capital invertido</p>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">${fmt(Math.round(totalCapital))}</p>
              <p className="text-xs text-slate-400 mt-1">ARS equivalente</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Valor actual</p>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">${fmt(Math.round(totalActual))}</p>
              <p className="text-xs text-slate-400 mt-1">ARS equivalente</p>
            </div>
            <div className={`border rounded-2xl p-4 sm:p-5 ${totalGanancia >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Resultado total</p>
              <p className={`text-2xl font-bold tabular-nums ${totalGanancia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {totalGanancia >= 0 ? '+' : ''}${fmt(Math.round(Math.abs(totalGanancia)))}
              </p>
              <p className={`text-xs mt-1 font-semibold ${totalGanancia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmtPct(pctGlobal)} sobre capital
              </p>
            </div>
          </div>

          {/* ── Próximos vencimientos ────────────────────────────────────────── */}
          {proximos.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">⏰ Vencimientos próximos (30 días)</p>
              <div className="space-y-2">
                {proximos.map(i => {
                  const venc = labelVencimiento(i.fecha_vencimiento)
                  return (
                    <div key={i.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-amber-100">
                      <div className="flex items-center gap-3">
                        <span className="text-base">{TIPO_LABELS[i.tipo]?.emoji ?? '📈'}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-700">{nombreDisplay(i)}</p>
                          <p className="text-xs text-slate-400">{i.fecha_vencimiento}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">${fmt(Math.round(toARS(i, true)))}</p>
                        {venc && <p className="text-xs font-semibold" style={{ color: venc.color }}>{venc.texto}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Lista por tipo ───────────────────────────────────────────────── */}
          {Object.entries(porTipo).map(([tipoKey, items]) => {
            const meta          = TIPO_LABELS[tipoKey] ?? { emoji: '📈', label: tipoKey, color: '#64748b' }
            const totalTipo     = items.reduce((s, i) => s + toARS(i, true), 0)
            const ganTipo       = items.reduce((s, i) => s + (toARS(i, true) - toARS(i, false)), 0)

            return (
              <div key={tipoKey} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                {/* Header del grupo */}
                <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between bg-slate-50/60">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{meta.emoji}</span>
                    <p className="text-sm font-semibold text-slate-700">{meta.label}</p>
                    <span className="text-xs text-slate-400">({items.length})</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">${fmt(Math.round(totalTipo))}</p>
                    {ganTipo !== 0 && (
                      <p className={`text-xs font-semibold ${ganTipo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {ganTipo >= 0 ? <TrendingUp size={10} className="inline" /> : <TrendingDown size={10} className="inline" />}
                        {' '}{ganTipo >= 0 ? '+' : ''}${fmt(Math.round(Math.abs(ganTipo)))}
                      </p>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="divide-y divide-slate-50">
                  {items.map(i => {
                    const capitalARS = toARS(i, false)
                    const actualARS  = toARS(i, true)
                    const gan        = actualARS - capitalARS
                    const pct        = capitalARS > 0 ? (gan / capitalARS * 100) : 0
                    const venc       = labelVencimiento(i.fecha_vencimiento)

                    return (
                      <div key={i.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-700 truncate">{nombreDisplay(i)}</p>
                            {i.estado === 'vencido' && (
                              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">Vencido</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-xs text-slate-400 truncate">{subDisplay(i)}</p>
                            {venc && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold shrink-0" style={{ color: venc.color }}>
                                <Clock size={9} />{venc.texto}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 ml-4 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-800">${fmt(Math.round(actualARS))}</p>
                            {gan !== 0 && (
                              <p className={`text-xs font-semibold ${gan >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {gan >= 0 ? '+' : ''}${fmt(Math.round(Math.abs(gan)))} ({fmtPct(pct)})
                              </p>
                            )}
                            {gan === 0 && (
                              <p className="text-xs text-slate-400">Capital: ${fmt(Math.round(capitalARS))}</p>
                            )}
                          </div>

                          {/* Acciones rápidas. En mobile siempre visibles:
                              sin hover el opacity-0 dejaba al user sin forma
                              de borrar. En sm+ sigue oculto hasta hover (UI
                              menos cargada). */}
                          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <DeleteButton
                              endpoint={`/api/inversiones/${i.id}`}
                              label="esta inversión"
                              description="La inversión se marcará como liquidada. El movimiento de origen se conserva."
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
