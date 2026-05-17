import { getAuthedClient } from '@/lib/supabase/server'
import { stripCuotaSuffix } from '@/lib/tarjeta-periodo'
import { todayAR, todayPartsAR } from '@/lib/timezone'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

// Tipos para joins de Supabase
type CuentaJoin    = { tipo_cuenta?: string | null; nombre_cuenta?: string | null } | null
type CategoriaJoin = { nombre_categoria?: string | null; icono?: string | null } | null

// Shape de un row leído desde la vista `movimientos_completos`.
type MovRow = {
  id:                     string
  fecha:                  string | null
  detalle:                string | null
  monto:                  number
  monto_estimado?:        number | null
  moneda:                 string | null
  tipo_movimiento:        string | null
  cuenta_origen:          string | null
  cuenta_destino:         string | null
  cuenta_origen_nombre:   string | null
  cuenta_destino_nombre:  string | null
  categoria:              string | null
  categoria_nombre:       string | null
  categoria_icono:        string | null
  conciliado:             boolean | null
  cuotas_total:           number | null
  cuota_actual:           number | null
}

type GastoFijoRow = {
  id:               string
  nombre_gasto:     string
  monto_estimado:   number
  dia_vencimiento:  number | null
  cuentas:          CuentaJoin
  categorias:       CategoriaJoin
}

const fmt  = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtR = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0,  maximumFractionDigits: 0  })

const TIPOS = {
  ingresos:   { titulo: 'Ingresos del mes',      color: 'var(--accent, #1a6b5a)', bg: 'bg-emerald-50', sub: 'Ingresos cobrados en el mes actual' },
  gastos:     { titulo: 'Gastos del mes',         color: '#dc2626', bg: 'bg-red-50',     sub: 'Cash flow: efectivo/banco + pagos a tarjeta' },
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

  let movimientos: MovRow[] = []
  let resumenData: Record<string, unknown> | null = null

  if (tipo === 'ingresos') {
    // Ingresos: periodo del mes actual, fecha <= hoy
    const { data } = await supabase
      .from('movimientos_completos').select('*')
      .eq('tipo_movimiento', 'Ingreso')
      .eq('periodo_tarjeta', periodoActual)
      .eq('user_id', user.id)
      .lte('fecha', todayStr)
      .order('fecha', { ascending: false })
    movimientos = (data ?? []) as MovRow[]

  } else if (tipo === 'gastos') {
    // Gastos del mes (CASH FLOW REAL):
    //   - Gastos con cuenta_origen != tarjeta del mes
    //   - + Transferencias con destino tarjeta del mes (pagos a tarjeta)
    const { data: tarjetas } = await supabase.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', user.id)
    const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))

    const [{ data: gastosNoTC }, { data: pagosTC }] = await Promise.all([
      supabase.from('movimientos_completos').select('*')
        .eq('tipo_movimiento', 'Gasto')
        .eq('user_id', user.id)
        .gte('fecha', inicioMes)
        .lte('fecha', todayStr)
        .order('fecha', { ascending: false }),
      supabase.from('movimientos_completos').select('*')
        .eq('tipo_movimiento', 'Transferencia')
        .eq('user_id', user.id)
        .gte('fecha', inicioMes)
        .lte('fecha', todayStr)
        .order('fecha', { ascending: false }),
    ])

    // Gastos no-tarjeta
    const gastos = ((gastosNoTC ?? []) as MovRow[]).filter(m => m.cuenta_origen != null && !tarjetaIds.has(m.cuenta_origen))

    // Pagos a tarjeta (transferencias con destino tarjeta)
    // Sintetizamos una "categoría" tipo "Pago tarjeta - XXX" para que entren al breakdown
    const pagos = ((pagosTC ?? []) as MovRow[])
      .filter(m => m.cuenta_destino != null && tarjetaIds.has(m.cuenta_destino))
      .map(m => ({
        ...m,
        categoria_nombre: `Pago a ${m.cuenta_destino_nombre ?? 'tarjeta'}`,
        categoria_icono: '💳',
        categoria: `__pago_${m.cuenta_destino}`,
      }))

    movimientos = [...gastos, ...pagos].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))

  } else if (tipo === 'tarjetas') {
    // Tres conceptos distintos que el user maneja:
    // 1. Período   = movs Gasto - Ingreso del periodo_tarjeta=mes actual
    // 2. Conciliado = lo que marcó como contablemente cubierto (flag `conciliado=true`)
    // 3. Pagado real = transferencia ARS hecha a la tarjeta (cash que efectivamente salió)
    //
    // Conciliado >= Pagado real (el user puede conciliar anticipándose al pago).
    // Mostramos "Conciliado · falta pagar $X" cuando hay desfase.
    //
    // Para USD: tu flujo es comprar dólares físicos → no hay transferencia que matchee.
    // Por eso solo cruzamos contra transferencias ARS. Si conciliaste un consumo USD,
    // asumimos que ya lo pagaste.
    const { data: tarjetas } = await supabase.from('cuentas')
      .select('id, nombre_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
      .eq('tipo_cuenta', 'Tarjeta Credito').eq('activa', true).eq('user_id', user.id)
      .order('nombre_cuenta')
    const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))

    const [{ data: movs }, { data: transferencias }] = await Promise.all([
      supabase.from('movimientos_completos').select('*')
        .in('tipo_movimiento', ['Gasto', 'Ingreso'])
        .eq('periodo_tarjeta', periodoActual)
        .eq('user_id', user.id),
      supabase.from('movimientos_completos').select('cuenta_destino, monto, moneda, fecha')
        .eq('tipo_movimiento', 'Transferencia')
        .eq('user_id', user.id)
        .gte('fecha', inicioMes)
        .lte('fecha', todayStr),
    ])

    movimientos = ((movs ?? []) as MovRow[]).filter(m => m.cuenta_origen != null && tarjetaIds.has(m.cuenta_origen))

    // Suma de transferencias ARS por tarjeta (cash efectivamente movido en el mes)
    const pagoRealArsPorTarjeta: Record<string, number> = {}
    for (const t of transferencias ?? []) {
      if (!t.cuenta_destino || !tarjetaIds.has(t.cuenta_destino)) continue
      if (t.moneda === 'USD') continue
      pagoRealArsPorTarjeta[t.cuenta_destino] =
        (pagoRealArsPorTarjeta[t.cuenta_destino] ?? 0) + (Number(t.monto) || 0)
    }

    resumenData = { tarjetas: tarjetas ?? [], pagoRealArsPorTarjeta }

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
  const porCategoria = movimientos.reduce<Record<string, { icono: string | null; nombre: string; movs: MovRow[]; subtotal: number }>>((acc, m) => {
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
            {/* text-3xl mobile borderline con montos AR de 8 dígitos en pantallas
                de 360px. text-2xl mobile da margen; text-3xl en sm+. */}
            <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: meta.color }}>${fmtR(total)}</p>
            <p className="text-xs text-slate-400 mt-1">{movimientos.length} movimientos</p>
          </div>

          {/* grid-cols-2 mobile con cards de categoría + montos AR de 6-7
              dígitos era apretado; grid-cols-1 mobile da espacio al ojo. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gruposOrdenados.map(g => (
              <div key={g.nombre} className="bg-white rounded-xl border border-slate-100 p-4">
                <p className="text-sm font-medium text-slate-700 mb-1 truncate flex items-center gap-1.5"><IconoCategoria icono={g.icono} size={16} /> {g.nombre}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: meta.color }}>${fmtR(g.subtotal)}</p>
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
                        {(m.cuotas_total ?? 0) > 1 && <p className="text-xs text-slate-400">Cuota {Math.min(m.cuota_actual ?? 1, m.cuotas_total ?? 1)}/{Math.max(m.cuota_actual ?? 1, m.cuotas_total ?? 1)}</p>}
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
      {tipo === 'tarjetas' && resumenData != null && (() => {
        const { tarjetas, pagoRealArsPorTarjeta } = resumenData as {
          tarjetas: Array<{ id: string; nombre_cuenta: string | null; fecha_cierre_tarjeta: string | null; fecha_vencimiento_tarjeta: string | null }>
          pagoRealArsPorTarjeta: Record<string, number>
        }

        // ── Foto real: sumamos ARS y USD en su moneda nativa (igual que conciliaciones).
        // Evitamos convertir USD→ARS con cotización estimada porque eso introduce
        // ruido (la cotización al momento del pago suele ser distinta de la actual).
        type Bucket = {
          nombre: string
          movs: MovRow[]
          ars_total: number; ars_pagado: number; ars_pendiente: number
          usd_total: number; usd_pagado: number; usd_pendiente: number
          // sort_value: total estimado en ARS, solo para ordenar
          sort_value: number
        }
        const porTarjeta = movimientos.reduce<Record<string, Bucket>>((acc, m) => {
          const k = m.cuenta_origen ?? 'x'
          if (!acc[k]) acc[k] = {
            nombre: m.cuenta_origen_nombre ?? '—', movs: [],
            ars_total: 0, ars_pagado: 0, ars_pendiente: 0,
            usd_total: 0, usd_pagado: 0, usd_pendiente: 0,
            sort_value: 0,
          }
          const b = acc[k]
          // Ingresos en cuenta_origen=tarjeta son descuentos/reintegros → restan.
          // Gastos suman. Mismo signo lo usa /conciliaciones.
          const signo = m.tipo_movimiento === 'Ingreso' ? -1 : 1
          const raw   = (Number(m.monto)          || 0) * signo
          const est   = (Number(m.monto_estimado ?? m.monto) || 0) * signo
          if (m.moneda === 'USD') {
            b.usd_total += raw
            if (m.conciliado) b.usd_pagado    += raw
            else              b.usd_pendiente += raw
          } else {
            b.ars_total += raw
            if (m.conciliado) b.ars_pagado    += raw
            else              b.ars_pendiente += raw
          }
          b.sort_value += est
          b.movs.push(m)
          return acc
        }, {})

        // Lista completa incluyendo tarjetas sin movs en el período
        const tarjetasView = tarjetas.map(t => {
          const b = porTarjeta[t.id]
          const ars_conciliado = b?.ars_pagado ?? 0
          const pago_real_ars  = pagoRealArsPorTarjeta[t.id] ?? 0
          // Si conciliaste más ARS de lo que transferiste, hay "conciliado pero falta pagar"
          const ars_falta_pagar = Math.max(0, ars_conciliado - pago_real_ars)
          return {
            id:         t.id,
            nombre:     t.nombre_cuenta ?? '—',
            cierre:     t.fecha_cierre_tarjeta     ? new Date(t.fecha_cierre_tarjeta     + 'T12:00:00').getDate() : null,
            vence:      t.fecha_vencimiento_tarjeta ? new Date(t.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null,
            ars_total:     b?.ars_total     ?? 0,
            ars_pagado:    ars_conciliado,
            ars_pendiente: b?.ars_pendiente ?? 0,
            ars_falta_pagar,
            usd_total:     b?.usd_total     ?? 0,
            usd_pagado:    b?.usd_pagado    ?? 0,
            usd_pendiente: b?.usd_pendiente ?? 0,
            sort_value:    b?.sort_value    ?? 0,
            movs:          b?.movs          ?? [],
          }
        }).sort((a, b) => b.sort_value - a.sort_value)

        // Totales del hero: sumamos ARS nativo y USD nativo por separado
        const totalArs        = tarjetasView.reduce((s, t) => s + t.ars_total,        0)
        const totalUsd        = tarjetasView.reduce((s, t) => s + t.usd_total,        0)
        const totalArsConc    = tarjetasView.reduce((s, t) => s + t.ars_pagado,       0)
        const totalUsdConc    = tarjetasView.reduce((s, t) => s + t.usd_pagado,       0)
        const totalArsFalta   = tarjetasView.reduce((s, t) => s + t.ars_falta_pagar,  0)
        const totalArsPend    = tarjetasView.reduce((s, t) => s + t.ars_pendiente,    0)
        const totalUsdPend    = tarjetasView.reduce((s, t) => s + t.usd_pendiente,    0)
        // "Ya pagado" = conciliado ARS que ya transferiste + USD conciliado
        const totalArsPagado  = totalArsConc - totalArsFalta
        const hayPendiente    = totalArsPend > 0 || totalUsdPend > 0
        const hayFaltaPagar   = totalArsFalta > 0

        const fmtArsUsd = (ars: number, usd: number, color: string) => (
          <>
            <p className="text-2xl font-bold" style={{ color }}>${fmtR(ars)}</p>
            {usd > 0 && <p className="text-sm font-semibold mt-0.5" style={{ color }}>+ U$S {fmt(usd)}</p>}
          </>
        )

        return (
          <>
            {/* Hero: cards — ARS y USD por separado, sin estimar conversión */}
            <div className={`grid grid-cols-1 gap-3 ${hayFaltaPagar ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              <div className="rounded-2xl p-5 bg-amber-50 border border-amber-100">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 mb-2">Deuda del período</p>
                {fmtArsUsd(totalArs, totalUsd, '#b45309')}
                <p className="text-xs text-slate-500 mt-1">Total consumos del período actual</p>
              </div>
              <div className="rounded-2xl p-5 bg-emerald-50 border border-emerald-100">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-2">Ya pagado</p>
                {fmtArsUsd(totalArsPagado, totalUsdConc, '#047857')}
                <p className="text-xs text-slate-500 mt-1">Conciliado y transferido (USD: pagado en efectivo)</p>
              </div>
              {hayFaltaPagar && (
                <div className="rounded-2xl p-5 bg-blue-50 border border-blue-100">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 mb-2">Por pagar</p>
                  <p className="text-2xl font-bold text-blue-700">${fmtR(totalArsFalta)}</p>
                  <p className="text-xs text-slate-500 mt-1">Conciliado pero falta transferir</p>
                </div>
              )}
              <div className={`rounded-2xl p-5 border ${hayPendiente ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Pendiente</p>
                {hayPendiente
                  ? fmtArsUsd(totalArsPend, totalUsdPend, '#b91c1c')
                  : <p className="text-2xl font-bold text-slate-500">$0</p>}
                <p className="text-xs text-slate-500 mt-1">Consumos no conciliados del período</p>
              </div>
            </div>

            <p className="text-xs text-slate-400">Hacé clic en una tarjeta para ver las categorías. Para el detalle de movimientos andá a <Link href="/conciliaciones" className="text-slate-600 underline hover:text-slate-800">conciliaciones</Link>.</p>

            {/* Lista de tarjetas — collapsed por default con <details> */}
            <div className="space-y-2">
              {tarjetasView.map(t => {
                const tienePend  = t.ars_pendiente > 0 || t.usd_pendiente > 0
                const faltaPagar = t.ars_falta_pagar > 0
                const yaPago     = (t.ars_pagado - t.ars_falta_pagar) > 0 || t.usd_pagado > 0
                const conMovs    = t.ars_total > 0 || t.usd_total > 0
                // Estado del badge: prioridad pendiente > por pagar > al día
                const status = tienePend ? 'pendiente' : faltaPagar ? 'por_pagar' : conMovs ? 'al_dia' : 'sin_movs'
                const cellArsUsd = (ars: number, usd: number, cls: string) => (
                  <>
                    <p className={`text-sm font-bold ${cls}`}>${fmtR(ars)}</p>
                    {usd > 0 && <p className={`text-[11px] font-semibold ${cls}`}>+ U$S {fmt(usd)}</p>}
                  </>
                )
                return (
                  <details key={t.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden group">
                    <summary className="px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center gap-4 list-none">
                      <span className="text-xl">💳</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{t.nombre}</p>
                        {(t.cierre || t.vence) && (
                          <p className="text-[11px] text-slate-400">
                            {t.cierre && `Cierre día ${t.cierre}`}{t.cierre && t.vence && ' · '}{t.vence && `Vence día ${t.vence}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">Período</p>
                        {cellArsUsd(t.ars_total, t.usd_total, 'text-slate-800')}
                      </div>
                      {yaPago && (
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-xs text-emerald-600">Pagado</p>
                          {cellArsUsd(t.ars_pagado - t.ars_falta_pagar, t.usd_pagado, 'text-emerald-700')}
                        </div>
                      )}
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">
                          {status === 'por_pagar' ? 'Por pagar' : 'Pendiente'}
                        </p>
                        {status === 'pendiente' && cellArsUsd(t.ars_pendiente, t.usd_pendiente, 'text-red-700')}
                        {status === 'por_pagar' && (
                          <p className="text-sm font-bold text-blue-700">${fmtR(t.ars_falta_pagar)}</p>
                        )}
                        {status === 'al_dia'    && <p className="text-sm font-bold text-emerald-600">✓ Al día</p>}
                        {status === 'sin_movs'  && <p className="text-sm font-bold text-slate-300">—</p>}
                      </div>
                      <span className="text-slate-300 group-open:rotate-90 transition-transform">›</span>
                    </summary>
                    {conMovs && (
                      <div className="px-5 pb-4 border-t border-slate-100 bg-slate-50/40">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-3 mb-2">Por categoría</p>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {Object.values(
                            t.movs.reduce<Record<string, { icono: string | null; nombre: string; subtotal: number }>>((acc, m) => {
                              const k = m.categoria ?? 'x'
                              if (!acc[k]) acc[k] = { icono: m.categoria_icono, nombre: m.categoria_nombre ?? 'Sin cat', subtotal: 0 }
                              // Ingresos en tarjeta (descuentos/reintegros) restan, igual que el total
                              const signo = m.tipo_movimiento === 'Ingreso' ? -1 : 1
                              acc[k].subtotal += (m.monto_estimado ?? m.monto) * signo
                              return acc
                            }, {})
                          ).sort((a, b) => b.subtotal - a.subtotal).map(cat => (
                            <div key={cat.nombre} className="bg-white rounded-lg px-3 py-2 border border-slate-100">
                              <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                                <IconoCategoria icono={cat.icono} size={13} /> {cat.nombre}
                              </p>
                              <p className="text-sm font-semibold text-slate-800">${fmtR(cat.subtotal)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </details>
                )
              })}
            </div>
          </>
        )
      })()}

      {/* ── PROYECTADO ── */}
      {tipo === 'proyectado' && resumenData != null && (() => {
        const { res, gastosFijos, ingresosFuturos } = resumenData as {
          res: {
            disponible_real:          number
            ingresos_futuros_mes:     number
            gastos_fijos_pendientes:  number
            deuda_tarjetas_periodo:   number
            pagos_tarjeta_mes:        number
          } | null
          gastosFijos:     GastoFijoRow[] | null
          ingresosFuturos: MovRow[]       | null
        }
        if (!res) return null
        const deudaRestante = Math.max(0, res.deuda_tarjetas_periodo - res.pagos_tarjeta_mes)
        const proyectado    = res.disponible_real + res.ingresos_futuros_mes - res.gastos_fijos_pendientes - deudaRestante
        const esPositivo    = proyectado >= 0

        return (
          <div className="space-y-4">
            <div className={`rounded-2xl p-5 sm:p-6 ${esPositivo ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
                Liquidez estimada a fin de mes
              </p>
              {/* text-4xl fijo desbordaba con montos AR de 8 dígitos en mobile.
                  Escalamos text-3xl sm:text-4xl + tabular-nums. */}
              <p className="text-3xl sm:text-4xl font-bold tabular-nums" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
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

            {(gastosFijos ?? []).filter(g => (g.dia_vencimiento ?? 0) >= today.getDate()).length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gastos fijos pendientes este mes</p>
                </div>
                {(gastosFijos ?? []).filter(g => (g.dia_vencimiento ?? 0) >= today.getDate()).map(g => (
                  <div key={g.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                      <p className="text-xs text-slate-400">
                        <IconoCategoria icono={(g.categorias as CategoriaJoin)?.icono ?? null} size={14} /> {(g.categorias as CategoriaJoin)?.nombre_categoria} · Día {g.dia_vencimiento} · {(g.cuentas as CuentaJoin)?.nombre_cuenta}
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
                {(ingresosFuturos ?? []).map(m => (
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
