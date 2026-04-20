import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
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
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { periodo: periodoParam } = await searchParams
  const today        = new Date()
  const mesActualStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const periodoActual = periodoParam ?? mesActualStr

  // 1. Tarjetas de crédito activas
  const { data: tarjetas } = await adminClient
    .from('cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .eq('user_id', user.id)
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
  const { data: todosMovsPeriodos } = await adminClient
    .from('movimientos')
    .select('periodo_tarjeta')
    .in('cuenta_origen', tarjetaIds)
    .eq('tipo_movimiento', 'Gasto')
    .eq('user_id', user.id)
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
  const { data: movsVencidos } = await adminClient
    .from('movimientos')
    .select('periodo_tarjeta')
    .in('cuenta_origen', tarjetaIds)
    .eq('tipo_movimiento', 'Gasto')
    .eq('conciliado', false)
    .eq('user_id', user.id)
    .lt('periodo_tarjeta', periodoActual)
    .not('periodo_tarjeta', 'is', null)
    .limit(1)

  const hayMesesVencidos = (movsVencidos ?? []).length > 0

  // 4. Movimientos del período actual (batch único)
  const { data: movsDelPeriodo } = await adminClient
    .from('movimientos')
    .select('cuenta_origen, conciliado, monto')
    .in('cuenta_origen', tarjetaIds)
    .eq('tipo_movimiento', 'Gasto')
    .eq('periodo_tarjeta', periodoActual)
    .eq('user_id', user.id)

  const movsByTarjeta: Record<string, { monto: number; conciliado: boolean }[]> = {}
  for (const m of movsDelPeriodo ?? []) {
    if (!movsByTarjeta[m.cuenta_origen]) movsByTarjeta[m.cuenta_origen] = []
    movsByTarjeta[m.cuenta_origen].push({ monto: m.monto, conciliado: m.conciliado })
  }

  // 5. Stats por tarjeta
  const tarjetasConDatos = (tarjetas ?? []).map(tarjeta => {
    const movs          = movsByTarjeta[tarjeta.id] ?? []
    const total         = movs.reduce((a, m) => a + m.monto, 0)
    const conciliados   = movs.filter(m => m.conciliado).length
    const noConciliados = movs.filter(m => !m.conciliado).length
    const totalPendiente = movs.filter(m => !m.conciliado).reduce((a, m) => a + m.monto, 0)
    const cierreDay     = tarjeta.fecha_cierre_tarjeta
      ? new Date(tarjeta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
    const venceDay      = tarjeta.fecha_vencimiento_tarjeta
      ? new Date(tarjeta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null

    return {
      tarjeta, total, conciliados, noConciliados, totalPendiente,
      tieneMovimientos: movs.length > 0,
      todoConciliado:   noConciliados === 0 && movs.length > 0,
      cierreDay, venceDay,
      imagenUrl: tarjeta.imagen_url ?? null,
      colorPrim: tarjeta.color_primario ?? '#0d3b6e',
    }
  })

  const totalMes          = tarjetasConDatos.reduce((a, t) => a + t.total, 0)
  const totalPendiente    = tarjetasConDatos.reduce((a, t) => a + t.totalPendiente, 0)
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
          -mx-8 -mt-8 escapa el p-8 del <main> para cubrir todo el ancho     */}
      <div
        className="-mx-8 -mt-8 mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 50%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-10 pt-10 pb-9">

          {/* Fila superior: label + mes grande */}
          <div className="flex items-start justify-between mb-10">
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
                Control de conciliaciones
              </p>
              <p className="text-sm text-white/45">
                Revisá los movimientos de cada tarjeta
              </p>
            </div>
            <h1 className="text-5xl lg:text-6xl font-black tracking-tight text-white leading-none text-right">
              {mesLabel}
            </h1>
          </div>

          {/* Total del período — centrado */}
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-white/55 uppercase tracking-widest mb-3">
              Total del período
            </p>
            <p className="text-5xl font-bold text-white mb-2">
              ${fmt(totalMes)}
            </p>
            {totalPendiente > 0 ? (
              <p className="text-base text-amber-300 font-medium">
                ${fmt(totalPendiente)} pendiente de conciliar
              </p>
            ) : totalMes > 0 ? (
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
          Las flechas están a los costados de la lista de tarjetas             */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4">

          {/* ← Mes anterior */}
          <div className="shrink-0 w-16 flex justify-center">
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
              tarjeta, total, conciliados, noConciliados, totalPendiente,
              tieneMovimientos, todoConciliado, cierreDay, venceDay, imagenUrl, colorPrim,
            }) => (
              <Link
                key={tarjeta.id}
                href={`/conciliaciones/${tarjeta.id}/${periodoActual}`}
                className={`flex items-center justify-between px-5 py-4 bg-white rounded-2xl border transition-all group
                  ${!tieneMovimientos
                    ? 'border-slate-100 opacity-55'
                    : noConciliados > 0
                    ? 'border-slate-100 hover:border-amber-200 hover:shadow-sm'
                    : 'border-slate-100 hover:border-emerald-100 hover:shadow-sm'
                  }`}
              >
                {/* Izquierda: mini card + info */}
                <div className="flex items-center gap-4">
                  <div
                    className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-white border border-slate-100"
                    style={{ width: 64, height: 40 }}
                  >
                    {imagenUrl
                      ? <img src={imagenUrl} alt={tarjeta.nombre_cuenta} className="w-full h-full object-contain" />
                      : <CreditCard size={20} className="text-slate-400" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{tarjeta.nombre_cuenta}</p>
                    <p className="text-xs text-slate-400">
                      Cierre día {cierreDay ?? '—'} · Vence día {venceDay ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Derecha: stats + total + badge */}
                <div className="flex items-center gap-6">
                  {tieneMovimientos ? (
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-400">
                        {conciliados} conciliados · {noConciliados} pendientes
                      </p>
                      {noConciliados > 0 && (
                        <p className="text-xs text-amber-500 font-medium">${fmt(totalPendiente)} sin conciliar</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 hidden sm:block">Sin movimientos</p>
                  )}

                  <p className="text-base font-bold text-slate-800 min-w-[110px] text-right">
                    {tieneMovimientos ? `$${fmt(total)}` : '—'}
                  </p>

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
              </Link>
            ))}
          </div>

          {/* → Mes siguiente */}
          <div className="shrink-0 w-16 flex justify-center">
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
