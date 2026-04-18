import { adminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { CheckCircle, AlertCircle, Clock } from 'lucide-react'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPeriodo(p: string) {
  const d = new Date(p + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

export default async function ConciliacionesPage() {
  const today     = new Date()
  const todayStr  = today.toISOString().slice(0, 10)
  const todayDay  = today.getDate()

  // Solo tarjetas de crédito activas
  const { data: tarjetas } = await adminClient
    .from('cuentas')
    .select('*')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .order('nombre_cuenta')

  // Para cada tarjeta, buscar periodos con movimientos
  const tarjetasConPeriodos = await Promise.all(
    (tarjetas ?? []).map(async tarjeta => {
      const { data: movimientos } = await adminClient
        .from('movimientos')
        .select('periodo_tarjeta, conciliado, monto, moneda, cotizacion')
        .eq('cuenta_origen', tarjeta.id)
        .eq('tipo_movimiento', 'Gasto')
        .order('periodo_tarjeta', { ascending: false })

      // Agrupar por periodo
      const periodoMap: Record<string, {
        total: number
        totalNoConciliado: number
        conciliados: number
        noConciliados: number
      }> = {}

      for (const m of movimientos ?? []) {
        const p = m.periodo_tarjeta as string
        if (!p) continue
        if (!periodoMap[p]) periodoMap[p] = { total: 0, totalNoConciliado: 0, conciliados: 0, noConciliados: 0 }
        periodoMap[p].total += m.monto
        if (m.conciliado) periodoMap[p].conciliados++
        else {
          periodoMap[p].noConciliados++
          periodoMap[p].totalNoConciliado += m.monto
        }
      }

      // Calcular fecha de cierre de este mes para saber si el periodo está cerrado
      const cierreDay = tarjeta.fecha_cierre_tarjeta
        ? new Date(tarjeta.fecha_cierre_tarjeta + 'T12:00:00').getDate()
        : null
      const venceDay = tarjeta.fecha_vencimiento_tarjeta
        ? new Date(tarjeta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate()
        : null

      const periodos = Object.entries(periodoMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([periodo, stats]) => {
          const periodoDate  = new Date(periodo + 'T12:00:00')
          const ahora        = new Date()
          // El periodo está cerrado si la fecha del periodo ya pasó
          const periodoPasado = periodoDate < new Date(ahora.getFullYear(), ahora.getMonth(), 1)
          const todoConciliado = stats.noConciliados === 0

          return {
            periodo,
            ...stats,
            periodoPasado,
            todoConciliado,
          }
        })
        // Mostrar solo periodos cerrados (pasados) que no están 100% conciliados
        // + el periodo actual
        .filter(p => !p.todoConciliado || !p.periodoPasado)
        .slice(0, 6)

      return { tarjeta, periodos, cierreDay, venceDay }
    })
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Control de conciliaciones</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Revisá los movimientos de cada tarjeta contra el resumen real
          </p>
        </div>
      </div>

      {tarjetasConPeriodos.map(({ tarjeta, periodos, cierreDay, venceDay }) => {
        const totalPendientes = periodos.reduce((a, p) => a + p.noConciliados, 0)

        return (
          <div key={tarjeta.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {/* Header de tarjeta */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">💳</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{tarjeta.nombre_cuenta}</p>
                  <p className="text-xs text-slate-400">
                    Cierre día {cierreDay} · Vence día {venceDay}
                    {venceDay === todayDay && (
                      <span className="ml-2 text-amber-500 font-medium">· Vence hoy — se conciliará automáticamente</span>
                    )}
                  </p>
                </div>
              </div>
              {totalPendientes > 0 ? (
                <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 px-3 py-1 rounded-full font-medium">
                  <AlertCircle size={12} />
                  {totalPendientes} sin conciliar
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full font-medium">
                  <CheckCircle size={12} />
                  Al día
                </span>
              )}
            </div>

            {/* Periodos */}
            {periodos.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-sm">Sin movimientos registrados</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {periodos.map(p => (
                  <Link
                    key={p.periodo}
                    href={`/conciliaciones/${tarjeta.id}/${p.periodo}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      {p.todoConciliado ? (
                        <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                      ) : p.periodoPasado ? (
                        <AlertCircle size={16} className="text-amber-400 shrink-0" />
                      ) : (
                        <Clock size={16} className="text-slate-300 shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-700">{formatPeriodo(p.periodo)}</p>
                        <p className="text-xs text-slate-400">
                          {p.conciliados} conciliados · {p.noConciliados} pendientes
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800">${fmt(p.total)}</p>
                        {p.noConciliados > 0 && (
                          <p className="text-xs text-amber-500">${fmt(p.totalNoConciliado)} sin conciliar</p>
                        )}
                      </div>
                      <span className="text-slate-300 group-hover:text-slate-500 transition-colors">›</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
