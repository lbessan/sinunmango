import { getAuthedClient } from '@/lib/supabase/server'
import { stripCuotaSuffix } from '@/lib/tarjeta-periodo'
import { todayAR, todayPartsAR } from '@/lib/timezone'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

const fmt  = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtR = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0,  maximumFractionDigits: 0  })

const TIPOS = {
  ingresos:   { titulo: 'Ingresos del mes',      color: 'var(--accent, #1a6b5a)', bg: 'bg-emerald-50', sub: 'Ingresos cobrados en el mes actual' },
  gastos:     { titulo: 'Gastos actuales',        color: '#dc2626', bg: 'bg-red-50',     sub: 'Gastos con fecha en el mes actual' },
  tarjetas:   { titulo: 'Deuda tarjetas',         color: '#d97706', bg: 'bg-amber-50',   sub: 'Gastos del periodo actual por tarjeta' },
  proyectado: { titulo: 'Proyección fin de mes',  color: 'var(--accent2, #1B3A6B)', bg: 'bg-blue-50',    sub: 'Cómo se calcula la liquidez estimada' },
}

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { tipo = 'ingresos' } = await searchParams
  const meta = TIPOS[tipo as keyof typeof TIPOS] ?? TIPOS.ingresos

  const { year: yAR, month: mAR } = todayPartsAR()
  const today         = new Date(yAR, mAR - 1, 1)
  const todayStr      = todayAR()
  const inicioMes     = `${yAR}-${String(mAR).padStart(2, '0')}-01`
  const periodoActual = inicioMes

  let movimientos: any[] = []
  let resumenData: any   = null

  if (tipo === 'ingresos') {
    // Ingresos: periodo del mes actual, fecha <= hoy
    const { data } = await supabase
      .from('movimientos_completos').select('*')
      .eq('tipo_movimiento', 'Ingreso')
      .eq('periodo_tarjeta', periodoActual)
      .eq('user_id', user.id)
      .lte('fecha', todayStr)
      .order('fecha', { ascending: false })
    movimientos = data ?? []

  } else if (tipo === 'gastos') {
    // Gastos: FECHA en el mes actual (sin importar periodo_tarjeta)
    const { data } = await supabase
      .from('movimientos_completos').select('*')
      .eq('tipo_movimiento', 'Gasto')
      .eq('user_id', user.id)
      .gte('fecha', inicioMes)
      .lte('fecha', todayStr)
      .order('fecha', { ascending: false })
    movimientos = data ?? []

  } else if (tipo === 'tarjetas') {
    const { data: tarjetas } = await supabase.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', user.id)
    const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))
    const { data } = await supabase
      .from('movimientos_completos').select('*')
      .eq('tipo_movimiento', 'Gasto')
      .eq('periodo_tarjeta', periodoActual)
      .eq('user_id', user.id)
      .order('cuenta_origen_nombre', { ascending: true })
      .order('fecha', { ascending: false })
    movimientos = (data ?? []).filter(m => m.cuenta_origen != null && tarjetaIds.has(m.cuenta_origen))

  } else if (tipo === 'proyectado') {
    const [{ data: res }, { data: gastosFijos }, { data: ingresosFuturos }, { data: params }] = await Promise.all([
      supabase.from('dashboard_resumen').select('*').eq('user_id', user.id).single(),
      supabase.from('gastos_fijos').select('*, cuentas(nombre_cuenta, tipo_cuenta), categorias(nombre_categoria, icono)').eq('activo', true).eq('user_id', user.id).order('dia_vencimiento'),
      supabase.from('movimientos_completos').select('*').eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', periodoActual).eq('user_id', user.id).gt('fecha', todayStr),
      supabase.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', user.id).single(),
    ])
    resumenData = { res, gastosFijos, ingresosFuturos, dolarBna: params?.valor ?? 1410 }
  }

  const total = movimientos.reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0)

  // Agrupar por categoría
  const porCategoria = movimientos.reduce<Record<string, { icono: string | null; nombre: string; movs: any[]; subtotal: number }>>((acc, m) => {
    const key = m.categoria ?? 'sin-cat'
    if (!acc[key]) acc[key] = { icono: m.categoria_icono, nombre: m.categoria_nombre ?? 'Sin categoría', movs: [], subtotal: 0 }
    acc[key].movs.push(m)
    acc[key].subtotal += m.monto_estimado ?? m.monto
    return acc
  }, {})
  const gruposOrdenados = Object.values(porCategoria).sort((a, b) => b.subtotal - a.subtotal)

  const mesLabel = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
  const thClass  = 'text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-2.5 font-medium whitespace-nowrap'

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-slate-200 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{meta.titulo}</h1>
          <p className="text-sm text-slate-400">{meta.sub} · {mesLabel}</p>
        </div>
      </div>

      {/* ── INGRESOS y GASTOS ── */}
      {(tipo === 'ingresos' || tipo === 'gastos') && (
        <>
          <div className={`rounded-2xl p-5 ${meta.bg}`}>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: meta.color }}>Total</p>
            <p className="text-3xl font-bold" style={{ color: meta.color }}>${fmtR(total)}</p>
            <p className="text-xs text-slate-400 mt-1">{movimientos.length} movimientos</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {gruposOrdenados.map(g => (
              <div key={g.nombre} className="bg-white rounded-xl border border-slate-100 p-4">
                <p className="text-sm font-medium text-slate-700 mb-1 truncate flex items-center gap-1.5"><IconoCategoria icono={g.icono} size={16} /> {g.nombre}</p>
                <p className="text-lg font-bold" style={{ color: meta.color }}>${fmtR(g.subtotal)}</p>
                <p className="text-xs text-slate-400">{g.movs.length} movimiento{g.movs.length !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalle de movimientos</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-50">
                  <th className={thClass}>Fecha</th><th className={thClass}>Detalle</th>
                  <th className={thClass}>Categoría</th><th className={thClass}>Cuenta</th>
                  <th className={`${thClass} text-right`}>Monto</th><th className="px-4 py-2.5" />
                </tr></thead>
                <tbody>
                  {movimientos.map(m => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{m.fecha}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-700 max-w-xs truncate">{stripCuotaSuffix(m.detalle) || '—'}</p>
                        {m.cuotas_total > 1 && <p className="text-xs text-slate-400">Cuota {Math.min(m.cuota_actual, m.cuotas_total)}/{Math.max(m.cuota_actual, m.cuotas_total)}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap"><span className="flex items-center gap-1.5"><IconoCategoria icono={m.categoria_icono} size={16} /> {m.categoria_nombre ?? '—'}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{m.cuenta_origen_nombre ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-right whitespace-nowrap" style={{ color: meta.color }}>
                        ${fmt(m.monto_estimado ?? m.monto)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/movimientos/${m.id}/editar`} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 inline-flex">
                          <Pencil size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TARJETAS ── */}
      {tipo === 'tarjetas' && (
        <>
          <div className="rounded-2xl p-5 bg-amber-50">
            <p className="text-xs uppercase tracking-wide text-amber-600 mb-1">Deuda total periodo</p>
            <p className="text-3xl font-bold text-amber-700">${fmtR(total)}</p>
            <p className="text-xs text-slate-400 mt-1">{movimientos.length} movimientos</p>
          </div>

          {(() => {
            const porTarjeta = movimientos.reduce<Record<string, { nombre: string; movs: any[]; subtotal: number }>>((acc, m) => {
              const key = m.cuenta_origen ?? 'x'
              if (!acc[key]) acc[key] = { nombre: m.cuenta_origen_nombre ?? '—', movs: [], subtotal: 0 }
              acc[key].movs.push(m)
              acc[key].subtotal += m.monto_estimado ?? m.monto
              return acc
            }, {})

            return Object.values(porTarjeta).sort((a, b) => b.subtotal - a.subtotal).map(t => (
              <div key={t.nombre} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">💳 {t.nombre}</p>
                  <p className="text-sm font-bold text-amber-600">${fmtR(t.subtotal)}</p>
                </div>
                {/* Mini breakdown por categoría */}
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
                    <thead><tr className="border-b border-slate-50">
                      <th className={thClass}>Fecha</th><th className={thClass}>Detalle</th>
                      <th className={thClass}>Categoría</th><th className={`${thClass} text-right`}>Monto</th>
                      <th className="px-4 py-2.5" />
                    </tr></thead>
                    <tbody>
                      {t.movs.map(m => (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{m.fecha}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-700 max-w-xs truncate">{stripCuotaSuffix(m.detalle) || '—'}</p>
                            {m.cuotas_total > 1 && <p className="text-xs text-slate-400">Cuota {Math.min(m.cuota_actual, m.cuotas_total)}/{Math.max(m.cuota_actual, m.cuotas_total)}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap"><span className="flex items-center gap-1.5"><IconoCategoria icono={m.categoria_icono} size={16} /> {m.categoria_nombre ?? '—'}</span></td>
                          <td className="px-4 py-3 font-semibold text-right text-amber-700 whitespace-nowrap">${fmt(m.monto_estimado ?? m.monto)}</td>
                          <td className="px-4 py-3">
                            <Link href={`/movimientos/${m.id}/editar`} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 inline-flex">
                              <Pencil size={13} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          })()}
        </>
      )}

      {/* ── PROYECTADO ── */}
      {tipo === 'proyectado' && resumenData && (() => {
        const { res, gastosFijos, ingresosFuturos } = resumenData
        if (!res) return null
        const deudaRestante = Math.max(0, res.deuda_tarjetas_periodo - res.pagos_tarjeta_mes)
        const proyectado    = res.disponible_real + res.ingresos_futuros_mes - res.gastos_fijos_pendientes - deudaRestante
        const esPositivo    = proyectado >= 0

        return (
          <div className="space-y-4">
            <div className={`rounded-2xl p-6 ${esPositivo ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
                Liquidez estimada a fin de mes
              </p>
              <p className="text-4xl font-bold" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
                {proyectado < 0 ? '-' : ''}${fmtR(Math.abs(proyectado))}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cómo se calcula</p>
              </div>
              {[
                { label: 'Saldo disponible actual',       value: res.disponible_real,        color: 'var(--accent, #1a6b5a)', signo: '+' },
                { label: 'Ingresos futuros del mes',      value: res.ingresos_futuros_mes,   color: 'var(--accent, #1a6b5a)', signo: '+' },
                { label: 'Gastos fijos pendientes',       value: res.gastos_fijos_pendientes, color: '#dc2626', signo: '-' },
                { label: 'Deuda tarjetas sin pagar',      value: deudaRestante,               color: '#d97706', signo: '-' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0">
                  <p className="text-sm text-slate-600">{row.label}</p>
                  <p className="text-sm font-semibold" style={{ color: row.color }}>{row.signo} ${fmtR(row.value)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Total proyectado</p>
                <p className="text-lg font-bold" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
                  = {proyectado < 0 ? '-' : ''}${fmtR(Math.abs(proyectado))}
                </p>
              </div>
            </div>

            {(gastosFijos ?? []).filter((g: any) => g.dia_vencimiento >= today.getDate()).length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gastos fijos pendientes este mes</p>
                </div>
                {(gastosFijos ?? []).filter((g: any) => g.dia_vencimiento >= today.getDate()).map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                      <p className="text-xs text-slate-400">
                        <IconoCategoria icono={(g.categorias as any)?.icono ?? null} size={14} /> {(g.categorias as any)?.nombre_categoria} · Día {g.dia_vencimiento} · {(g.cuentas as any)?.nombre_cuenta}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-red-500">${fmtR(g.monto_estimado)}</p>
                  </div>
                ))}
              </div>
            )}

            {(ingresosFuturos ?? []).length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ingresos futuros del mes</p>
                </div>
                {(ingresosFuturos ?? []).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm text-slate-700">{m.detalle ?? '—'}</p>
                      <p className="text-xs text-slate-400">{m.fecha} · {m.cuenta_origen_nombre}</p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-600">${fmtR(m.monto_estimado ?? m.monto)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
