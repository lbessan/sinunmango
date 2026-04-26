import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

const fmt  = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtR = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0,  maximumFractionDigits: 0  })

// Avanza un mes en formato YYYY-MM-01
function nextPeriodo(p: string): string {
  const d = new Date(p + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10).slice(0, 7) + '-01'
}

function periodoLabel(p: string): string {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

export default async function ProyeccionMesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { periodo } = await searchParams
  if (!periodo) return <p className="text-slate-400">Periodo no especificado</p>

  const today     = new Date()
  const mesActual = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const label     = periodoLabel(periodo)

  // ── Datos base ────────────────────────────────────────────────────────────
  const [{ data: resumen }, { data: gastosFijos }, { data: tarjetas }, { data: params }] =
    await Promise.all([
      adminClient.from('dashboard_resumen').select('*').eq('user_id', user.id).single(),
      adminClient.from('gastos_fijos')
        .select('*, cuentas(id, nombre_cuenta, tipo_cuenta), categorias(nombre_categoria, icono)')
        .eq('activo', true).eq('user_id', user.id).order('dia_vencimiento'),
      adminClient.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('activa', true).eq('user_id', user.id),
      adminClient.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', user.id).single(),
    ])

  const dolar      = params?.valor ?? 1410
  const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))

  // Gastos fijos mensuales en efectivo/banco
  const gastosFijosEfectivo = (gastosFijos ?? [])
    .filter(g => (g.cuentas as any)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((acc, g) => acc + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado), 0)

  // Proyectado fin del mes actual (punto de partida)
  const deudaRestante = Math.max(
    0,
    (resumen?.deuda_tarjetas_periodo ?? 0) - (resumen?.pagos_tarjeta_mes ?? 0)
  )
  const proyectadoMesActual =
    (resumen?.disponible_real ?? 0) +
    (resumen?.ingresos_futuros_mes ?? 0) -
    (resumen?.gastos_fijos_pendientes ?? 0) -
    deudaRestante

  // ── Avanzar mes a mes HASTA el periodo objetivo (sin incluirlo) ───────────
  // Comparamos strings YYYY-MM-01 para evitar problemas de timezone
  let saldoInicio = proyectadoMesActual
  let cursor      = nextPeriodo(mesActual) // primer mes futuro

  while (cursor < periodo) {
    const { data: ingM } = await adminClient
      .from('movimientos').select('monto, moneda, cotizacion, conciliado')
      .eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', cursor).eq('user_id', user.id)
    const { data: gasM } = await adminClient
      .from('movimientos').select('monto, moneda, cotizacion, conciliado, cuenta_origen')
      .eq('tipo_movimiento', 'Gasto').eq('periodo_tarjeta', cursor).eq('user_id', user.id)

    const ingTotal = (ingM ?? []).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    const tcTotal  = (gasM ?? []).filter(m => tarjetaIds.has(m.cuenta_origen))
      .reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)

    saldoInicio += ingTotal - gastosFijosEfectivo - tcTotal
    cursor       = nextPeriodo(cursor)
  }

  // ── Datos del periodo objetivo ────────────────────────────────────────────
  const [{ data: ingresosMes }, { data: gastosTC }] = await Promise.all([
    adminClient.from('movimientos_completos').select('*')
      .eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', periodo).eq('user_id', user.id).order('fecha'),
    adminClient.from('movimientos_completos').select('*')
      .eq('tipo_movimiento', 'Gasto').eq('periodo_tarjeta', periodo).eq('user_id', user.id).order('fecha'),
  ])

  const gastosTC_filtrados = (gastosTC ?? []).filter(m => tarjetaIds.has(m.cuenta_origen))

  const totalIngresos = (ingresosMes ?? []).reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0)
  const totalTC       = gastosTC_filtrados.reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0)
  const proyeccion    = saldoInicio + totalIngresos - gastosFijosEfectivo - totalTC
  const esPositivo    = proyeccion >= 0

  const thClass = 'text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-2.5 font-medium whitespace-nowrap'

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-slate-200 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Proyección {label}</h1>
          <p className="text-sm text-slate-400">Estimación basada en movimientos cargados y gastos recurrentes</p>
        </div>
      </div>

      {/* Resultado */}
      <div className={`rounded-2xl p-6 ${esPositivo ? 'bg-emerald-50' : 'bg-red-50'}`}>
        <p className="text-xs uppercase tracking-wide mb-1" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
          Liquidez estimada al cierre de {label}
        </p>
        <p className="text-4xl font-bold" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
          {proyeccion < 0 ? '-' : ''}${fmtR(Math.abs(proyeccion))}
        </p>
      </div>

      {/* Fórmula */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cómo se calcula</p>
        </div>
        {[
          { label: 'Saldo proyectado inicio del mes',                          value: saldoInicio,        color: 'var(--accent, #1a6b5a)', signo: '' },
          { label: `Ingresos cargados (${(ingresosMes ?? []).length} movs)`,   value: totalIngresos,      color: 'var(--accent, #1a6b5a)', signo: '+' },
          { label: 'Gastos fijos en efectivo/banco',                           value: gastosFijosEfectivo, color: '#dc2626', signo: '-' },
          { label: `Gastos tarjetas del periodo (${gastosTC_filtrados.length} movs)`, value: totalTC,    color: '#d97706', signo: '-' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0">
            <p className="text-sm text-slate-600">{row.label}</p>
            <p className="text-sm font-semibold" style={{ color: row.color }}>
              {row.signo ? `${row.signo} ` : ''}${fmtR(Math.abs(row.value))}
            </p>
          </div>
        ))}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Total proyectado</p>
          <p className="text-lg font-bold" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
            = {proyeccion < 0 ? '-' : ''}${fmtR(Math.abs(proyeccion))}
          </p>
        </div>
      </div>

      {/* Ingresos */}
      {(ingresosMes ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-emerald-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Ingresos del periodo</p>
            <p className="text-sm font-bold text-emerald-700">${fmtR(totalIngresos)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-50">
                <th className={thClass}>Fecha</th><th className={thClass}>Detalle</th>
                <th className={thClass}>Categoría</th><th className={thClass}>Cuenta</th>
                <th className={`${thClass} text-right`}>Monto</th>
              </tr></thead>
              <tbody>
                {(ingresosMes ?? []).map(m => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-400">{m.fecha}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{m.detalle ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500"><span className="flex items-center gap-1.5"><IconoCategoria icono={m.categoria_icono} size={16} /> {m.categoria_nombre ?? '—'}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{m.cuenta_origen_nombre ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-right text-emerald-600">${fmt(m.monto_estimado ?? m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gastos fijos en efectivo */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-red-50 flex items-center justify-between">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Gastos fijos en efectivo/banco</p>
          <p className="text-sm font-bold text-red-600">${fmtR(gastosFijosEfectivo)}</p>
        </div>
        {(gastosFijos ?? [])
          .filter(g => (g.cuentas as any)?.tipo_cuenta !== 'Tarjeta Credito')
          .map(g => {
            const monto = g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado
            return (
              <div key={g.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                  <p className="text-xs text-slate-400">
                    <IconoCategoria icono={(g.categorias as any)?.icono ?? null} size={14} /> {(g.categorias as any)?.nombre_categoria}
                    {g.dia_vencimiento ? ` · Día ${g.dia_vencimiento}` : ''}
                    {(g.cuentas as any)?.nombre_cuenta ? ` · ${(g.cuentas as any).nombre_cuenta}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-red-500">${fmtR(monto)}</p>
              </div>
            )
          })}
      </div>

      {/* Gastos de tarjeta del periodo agrupados por tarjeta */}
      {gastosTC_filtrados.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-amber-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Gastos tarjeta del periodo</p>
            <p className="text-sm font-bold text-amber-700">${fmtR(totalTC)}</p>
          </div>
          {(() => {
            const porTarjeta = gastosTC_filtrados.reduce<Record<string, { nombre: string; movs: any[]; subtotal: number }>>((acc, m) => {
              const k = m.cuenta_origen ?? 'x'
              if (!acc[k]) acc[k] = { nombre: m.cuenta_origen_nombre ?? '—', movs: [], subtotal: 0 }
              acc[k].movs.push(m)
              acc[k].subtotal += m.monto_estimado ?? m.monto
              return acc
            }, {})
            return Object.values(porTarjeta).sort((a, b) => b.subtotal - a.subtotal).map(t => (
              <div key={t.nombre}>
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-medium">💳 {t.nombre}</p>
                  <p className="text-xs font-semibold text-amber-600">${fmtR(t.subtotal)}</p>
                </div>

                {/* Breakdown por categoría */}
                <div className="px-5 py-3 grid grid-cols-2 lg:grid-cols-3 gap-2 border-b border-slate-50">
                  {Object.values(
                    t.movs.reduce<Record<string, { icono: string | null; nombre: string; subtotal: number }>>((acc, m) => {
                      const k = m.categoria ?? 'x'
                      if (!acc[k]) acc[k] = { icono: m.categoria_icono, nombre: m.categoria_nombre ?? 'Sin cat', subtotal: 0 }
                      acc[k].subtotal += m.monto_estimado ?? m.monto
                      return acc
                    }, {})
                  ).sort((a, b) => b.subtotal - a.subtotal).map(cat => (
                    <div key={cat.nombre} className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1"><IconoCategoria icono={cat.icono} size={14} /> {cat.nombre}</p>
                      <p className="text-sm font-semibold text-slate-800">${fmtR(cat.subtotal)}</p>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {t.movs.map(m => (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{m.fecha}</td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm text-slate-700 max-w-xs truncate">{m.detalle ?? '—'}</p>
                            {m.cuotas_total > 1 && <p className="text-xs text-slate-400">Cuota {Math.min(m.cuota_actual, m.cuotas_total)}/{Math.max(m.cuota_actual, m.cuotas_total)}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap"><span className="flex items-center gap-1.5"><IconoCategoria icono={m.categoria_icono} size={16} /> {m.categoria_nombre ?? '—'}</span></td>
                          <td className="px-4 py-2.5 font-semibold text-right text-amber-700 whitespace-nowrap">${fmt(m.monto_estimado ?? m.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          })()}
        </div>
      )}

    </div>
  )
}
