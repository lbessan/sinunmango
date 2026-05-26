import { getAuthedClient } from '@/lib/supabase/server'
import { getCurrentWorkspace } from '@/lib/workspace'
import { primerDiaMesAR } from '@/lib/timezone'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, AlertCircle, ChevronLeft, ChevronRight, CreditCard } from 'lucide-react'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatMesCorto(p: string) {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    .replace(/^\w/, c => c.toUpperCase())
    .replace('.', '')
}

export default async function ConciliacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId

  const { periodo: periodoParam } = await searchParams
  const mesActualStr = primerDiaMesAR()
  const periodoActual = periodoParam ?? mesActualStr

  // 1. Tarjetas de crédito activas
  const { data: tarjetas } = await supabase
    .from('cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .eq('user_id', wsId)
    .order('nombre_cuenta')

  const tarjetaIds = (tarjetas ?? []).map(t => t.id)

  if (tarjetaIds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-center py-20 text-slate-400 text-sm">No hay tarjetas de crédito activas.</p>
      </div>
    )
  }

  // 2. Todos los períodos con movimientos de tarjeta (para navegación)
  const { data: todosMovsPeriodos } = await supabase
    .from('movimientos')
    .select('periodo_tarjeta')
    .in('cuenta_origen', tarjetaIds)
    .in('tipo_movimiento', ['Gasto', 'Ingreso'])
    .eq('user_id', wsId)
    .not('periodo_tarjeta', 'is', null)

  const todosPeriodos = [
    ...new Set([
      ...(todosMovsPeriodos ?? []).map(m => m.periodo_tarjeta as string),
      mesActualStr,
    ]),
  ].sort()

  const currentIdx  = todosPeriodos.indexOf(periodoActual)
  const prevPeriodo = currentIdx > 0 ? todosPeriodos[currentIdx - 1] : null
  const nextPeriodo = currentIdx < todosPeriodos.length - 1 ? todosPeriodos[currentIdx + 1] : null

  // 3. ¿Meses anteriores con pendientes?
  const { data: movsVencidos } = await supabase
    .from('movimientos')
    .select('periodo_tarjeta')
    .in('cuenta_origen', tarjetaIds)
    .in('tipo_movimiento', ['Gasto', 'Ingreso'])
    .eq('conciliado', false)
    .eq('user_id', wsId)
    .lt('periodo_tarjeta', periodoActual)
    .not('periodo_tarjeta', 'is', null)
    .limit(1)

  const hayMesesVencidos = (movsVencidos ?? []).length > 0

  // 4. Movimientos del período actual (batch único) — incluye Ingresos (descuentos)
  const { data: movsDelPeriodo } = await supabase
    .from('movimientos')
    .select('cuenta_origen, conciliado, monto, tipo_movimiento, moneda, cotizacion')
    .in('cuenta_origen', tarjetaIds)
    .in('tipo_movimiento', ['Gasto', 'Ingreso'])
    .eq('periodo_tarjeta', periodoActual)
    .eq('user_id', wsId)

  type MovIdx = { monto: number; conciliado: boolean; tipo: string; moneda: string; cotizacion: number | null }
  const movsByTarjeta: Record<string, MovIdx[]> = {}
  for (const m of movsDelPeriodo ?? []) {
    if (!m.cuenta_origen || !m.tipo_movimiento) continue
    if (!movsByTarjeta[m.cuenta_origen]) movsByTarjeta[m.cuenta_origen] = []
    movsByTarjeta[m.cuenta_origen].push({
      monto: m.monto, conciliado: m.conciliado, tipo: m.tipo_movimiento,
      moneda: m.moneda, cotizacion: m.cotizacion,
    })
  }

  // Monto firmado separado por moneda (Gastos suman, Ingresos restan)
  const signedARS = (m: MovIdx) => m.moneda === 'USD' ? 0 : m.tipo === 'Ingreso' ? -m.monto : m.monto
  const signedUSD = (m: MovIdx) => m.moneda !== 'USD' ? 0 : m.tipo === 'Ingreso' ? -m.monto : m.monto

  // 5. Stats por tarjeta — ARS y USD por separado
  const tarjetasConDatos = (tarjetas ?? []).map(tarjeta => {
    const movs            = movsByTarjeta[tarjeta.id] ?? []
    const totalARS        = movs.reduce((a, m) => a + signedARS(m), 0)
    const totalUSD        = movs.reduce((a, m) => a + signedUSD(m), 0)
    const conciliados     = movs.filter(m => m.conciliado).length
    const noConciliados   = movs.filter(m => !m.conciliado).length
    const totalPendiente  = movs.filter(m => !m.conciliado).reduce((a, m) => a + signedARS(m), 0)
    const totalPendienteUSD = movs.filter(m => !m.conciliado).reduce((a, m) => a + signedUSD(m), 0)
    // alias para el total ARS usado en el banner
    const total = totalARS
    const cierreDay     = tarjeta.fecha_cierre_tarjeta
      ? new Date(tarjeta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
    const venceDay      = tarjeta.fecha_vencimiento_tarjeta
      ? new Date(tarjeta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null

    return {
      tarjeta, total, totalARS, totalUSD, conciliados, noConciliados,
      totalPendiente, totalPendienteUSD,
      tieneMovimientos: movs.length > 0,
      todoConciliado:   noConciliados === 0 && movs.length > 0,
      cierreDay, venceDay,
      imagenUrl: tarjeta.imagen_url ?? null,
      colorPrim: tarjeta.color_primario ?? '#0d3b6e',
    }
  })

  const totalMes          = tarjetasConDatos.reduce((a, t) => a + t.totalARS, 0)
  const totalMesUSD       = tarjetasConDatos.reduce((a, t) => a + t.totalUSD, 0)
  const totalPendiente    = tarjetasConDatos.reduce((a, t) => a + t.totalPendiente, 0)
  const totalPendienteUSD = tarjetasConDatos.reduce((a, t) => a + t.totalPendienteUSD, 0)
  const totalConciliados  = tarjetasConDatos.reduce((a, t) => a + t.conciliados, 0)
  const totalNoConciliados = tarjetasConDatos.reduce((a, t) => a + t.noConciliados, 0)
  const tarjetasActivas   = tarjetasConDatos.filter(t => t.tieneMovimientos).length

  const mesLabel = new Date(periodoActual + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .toUpperCase()
    .replace(' DE ', ' ')

  return (
    <div>

      {/* ── BANNER FULL-BLEED ────────────────────────────────────────────────
          -mx-4 -mt-4 lg:-mx-8 lg:-mt-8: escapamos el p-4 del <main> en mobile
          y p-8 en desktop. Antes era -mx-8 fijo → overflow en mobile. */}
      <div
        className="-mx-4 -mt-4 mb-6 lg:-mx-8 lg:-mt-8 lg:mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 50%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-5 pt-6 pb-7 lg:px-10 lg:pt-10 lg:pb-9">

          {/* Fila superior: label + mes grande. En mobile el mes va debajo
              para no apretarse contra el label. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 lg:mb-10">
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
                Control de conciliaciones
              </p>
              <p className="text-sm text-white/45">
                Revisá los movimientos de cada tarjeta
              </p>
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-none sm:text-right">
              {mesLabel}
            </h1>
          </div>

          {/* Total del período — centrado. text-3xl mobile evita overflow
              con montos AR de 8+ dígitos (text-5xl original = 48px). */}
          <div className="text-center mb-6 lg:mb-10">
            <p className="text-xs font-semibold text-white/55 uppercase tracking-widest mb-3">
              Total del período
            </p>
            <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-1 tabular-nums break-words">
              ${fmt(totalMes)}
            </p>
            {totalMesUSD > 0 && (
              <p className="text-base text-blue-300 font-semibold mb-2">
                + U$S {fmt(totalMesUSD)} en dólares
              </p>
            )}
            {totalPendiente > 0 || totalPendienteUSD > 0 ? (
              <p className="text-base text-amber-300 font-medium">
                {totalPendiente > 0 && `$${fmt(totalPendiente)}`}
                {totalPendiente > 0 && totalPendienteUSD > 0 && ' + '}
                {totalPendienteUSD > 0 && `U$S ${fmt(totalPendienteUSD)}`}
                {' pendiente de conciliar'}
              </p>
            ) : totalMes > 0 || totalMesUSD > 0 ? (
              <p className="text-sm text-emerald-300 flex items-center justify-center gap-1.5 font-medium">
                <CheckCircle size={14} /> Todo conciliado
              </p>
            ) : (
              <p className="text-sm text-white/40">Sin movimientos registrados</p>
            )}
          </div>

          {/* Stats bar */}
          <div className="border-t border-white/15 pt-6 flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-10 flex-wrap">
              <div className="text-center">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">Con movimientos</p>
                <p className="text-lg font-bold text-white">{tarjetasActivas} de {tarjetasConDatos.length}</p>
              </div>
              {totalConciliados > 0 && (
                <div className="text-center">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">Conciliados</p>
                  <p className="text-lg font-bold text-emerald-300">{totalConciliados}</p>
                </div>
              )}
              {totalNoConciliados > 0 && (
                <div className="text-center">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">Pendientes</p>
                  <p className="text-lg font-bold text-amber-300">{totalNoConciliados}</p>
                </div>
              )}
            </div>
            {hayMesesVencidos && (
              <Link
                href={prevPeriodo ? `/conciliaciones?periodo=${prevPeriodo}` : '#'}
                className="flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200 transition-colors font-medium"
              >
                <AlertCircle size={14} />
                Meses anteriores con pendientes
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── NAVEGACIÓN + TARJETAS ────────────────────────────────────────────
          Las flechas laterales están ocultas en mobile (roban ~80px de ancho).
          En mobile usamos una nav compacta arriba de la lista. */}

      {/* Nav mobile: anterior + siguiente como botones chicos arriba */}
      <div className="max-w-4xl mx-auto mb-3 flex items-center justify-between sm:hidden">
        {prevPeriodo ? (
          <Link
            href={`/conciliaciones?periodo=${prevPeriodo}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={16} /> {formatMesCorto(prevPeriodo)}
          </Link>
        ) : <span />}
        {nextPeriodo ? (
          <Link
            href={`/conciliaciones?periodo=${nextPeriodo}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {formatMesCorto(nextPeriodo)} <ChevronRight size={16} />
          </Link>
        ) : <span />}
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4">

          {/* ← Mes anterior (solo desktop/tablet) */}
          <div className="hidden sm:flex shrink-0 w-16 justify-center">
            {prevPeriodo ? (
              <Link
                href={`/conciliaciones?periodo=${prevPeriodo}`}
                className="flex flex-col items-center gap-2 group"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border border-slate-200 bg-white group-hover:shadow-md group-hover:border-slate-300 transition-all"
                >
                  <ChevronLeft size={22} className="text-slate-500 group-hover:text-slate-700 transition-colors" />
                </div>
                <span className="text-[11px] text-slate-400 font-medium group-hover:text-slate-600 transition-colors text-center leading-tight">
                  {formatMesCorto(prevPeriodo)}
                </span>
              </Link>
            ) : <div className="w-12" />}
          </div>

          {/* Lista de tarjetas */}
          <div className="flex-1 space-y-3">
            {tarjetasConDatos.map(({
              tarjeta, totalARS, totalUSD, conciliados, noConciliados, totalPendiente,
              tieneMovimientos, todoConciliado, cierreDay, venceDay, imagenUrl, colorPrim,
            }) => (
              <Link
                key={tarjeta.id}
                href={`/conciliaciones/${tarjeta.id}/${periodoActual}`}
                className={`block px-4 py-3 sm:px-5 sm:py-4 bg-white rounded-2xl border transition-all group
                  ${!tieneMovimientos
                    ? 'border-slate-100 opacity-55'
                    : noConciliados > 0
                    ? 'border-slate-100 hover:border-amber-200 hover:shadow-sm'
                    : 'border-slate-100 hover:border-emerald-100 hover:shadow-sm'
                  }`}
              >
                {/* Layout: en mobile (< sm) el monto va debajo del nombre.
                    En sm+ vuelve al horizontal con stats + monto + badge. */}
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">

                  {/* Mini card */}
                  <div
                    className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                    style={{ background: colorPrim, width: 64, height: 40 }}
                  >
                    {imagenUrl
                      ? <img src={imagenUrl} alt={tarjeta.nombre_cuenta} className="w-full h-full object-contain" />
                      : <CreditCard size={16} className="text-white/60" />
                    }
                  </div>

                  {/* Nombre + cierre/vence + monto (en mobile el monto va acá) */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{tarjeta.nombre_cuenta}</p>
                        <p className="text-xs text-slate-400">
                          Cierre día {cierreDay ?? '—'} · Vence día {venceDay ?? '—'}
                        </p>
                      </div>
                      {/* Monto inline en mobile — sin min-width fijo */}
                      <div className="text-right shrink-0 sm:hidden">
                        {tieneMovimientos ? (
                          <>
                            <p className="text-sm font-bold text-slate-800 tabular-nums">${fmt(totalARS)}</p>
                            {totalUSD !== 0 && (
                              <p className="text-[11px] font-semibold text-blue-600 tabular-nums">
                                + U$S {fmt(Math.abs(totalUSD))}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm font-bold text-slate-300">—</p>
                        )}
                      </div>
                    </div>

                    {/* Badge en mobile — debajo del nombre */}
                    {tieneMovimientos && (
                      <div className="mt-2 sm:hidden">
                        {todoConciliado ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full font-semibold">
                            <CheckCircle size={10} /> Al día
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full font-semibold">
                            <AlertCircle size={10} /> {noConciliados} pendiente{noConciliados !== 1 ? 's' : ''}
                            {noConciliados > 0 && totalPendiente > 0 && (
                              <span className="text-amber-500/80 tabular-nums">· ${fmt(totalPendiente)}</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Derecha — solo sm+: stats + total + badge + chevron */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    {tieneMovimientos ? (
                      <div className="text-right">
                        <p className="text-xs text-slate-400">
                          {conciliados} conciliados · {noConciliados} pendientes
                        </p>
                        {noConciliados > 0 && (
                          <p className="text-xs text-amber-500 font-medium tabular-nums">${fmt(totalPendiente)} sin conciliar</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300">Sin movimientos</p>
                    )}

                    <div className="text-right min-w-[130px]">
                      {tieneMovimientos ? (
                        <>
                          <p className="text-base font-bold text-slate-800 tabular-nums">${fmt(totalARS)}</p>
                          {totalUSD !== 0 && (
                            <p className="text-xs font-semibold text-blue-600 tabular-nums">
                              + U$S {fmt(Math.abs(totalUSD))}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-base font-bold text-slate-300">—</p>
                      )}
                    </div>

                    {tieneMovimientos && (
                      todoConciliado ? (
                        <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full font-semibold whitespace-nowrap">
                          <CheckCircle size={11} /> Al día
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 px-3 py-1.5 rounded-full font-semibold whitespace-nowrap">
                          <AlertCircle size={11} /> {noConciliados} pendiente{noConciliados !== 1 ? 's' : ''}
                        </span>
                      )
                    )}

                    <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* → Mes siguiente (solo desktop/tablet) */}
          <div className="hidden sm:flex shrink-0 w-16 justify-center">
            {nextPeriodo ? (
              <Link
                href={`/conciliaciones?periodo=${nextPeriodo}`}
                className="flex flex-col items-center gap-2 group"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border border-slate-200 bg-white group-hover:shadow-md group-hover:border-slate-300 transition-all"
                >
                  <ChevronRight size={22} className="text-slate-500 group-hover:text-slate-700 transition-colors" />
                </div>
                <span className="text-[11px] text-slate-400 font-medium group-hover:text-slate-600 transition-colors text-center leading-tight">
                  {formatMesCorto(nextPeriodo)}
                </span>
              </Link>
            ) : <div className="w-12" />}
          </div>

        </div>
      </div>

    </div>
  )
}
