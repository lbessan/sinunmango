import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function Thumbnail({ imagenUrl, colorPrim, tipo, nombre, moneda }: {
  imagenUrl?: string | null; colorPrim: string; tipo: string; nombre: string; moneda?: string | null
}) {
  // Tarjeta: landscape, object-cover para llenar limpio
  if (tipo === 'Tarjeta Credito') {
    return (
      <div className="shrink-0 rounded-md overflow-hidden flex items-center justify-center"
        style={{ width: 56, height: 36, background: '#1e293b' }}>
        {imagenUrl
          ? <img src={imagenUrl} alt={nombre} className="w-full h-full object-cover" />
          : <span className="text-sm">💳</span>}
      </div>
    )
  }
  // Efectivo y banco: cuadrado con logo
  const efectivoSrc = tipo === 'Efectivo' ? (moneda === 'USD' ? '/logo_dollar.png' : '/logo_peso.png') : null
  const src = imagenUrl ?? efectivoSrc
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 overflow-hidden" style={{ background: '#f1f5f9' }}>
      {src ? <img src={src} alt={nombre} className="w-8 h-8 object-contain p-0.5 rounded-lg" /> : <span>🏦</span>}
    </div>
  )
}

async function calcularProyecciones(userId: string, meses = 4) {
  const today = new Date()
  const [{ data: resumen }, { data: gastosFijos }, { data: tarjetas }, { data: params }] =
    await Promise.all([
      adminClient.from('dashboard_resumen').select('*').eq('user_id', userId).single(),
      adminClient.from('gastos_fijos').select('*, cuentas(tipo_cuenta)').eq('activo', true).eq('user_id', userId),
      adminClient.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('activa', true).eq('user_id', userId),
      adminClient.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', userId).single(),
    ])
  if (!resumen) return { proyectadoActual: 0, proyecciones: [] }
  const dolar      = params?.valor ?? 1410
  const tarjetaIds = new Set((tarjetas ?? []).map(t => t.id))
  const deudaRestante = Math.max(0, resumen.deuda_tarjetas_periodo - resumen.pagos_tarjeta_mes)
  const proyectadoActual = resumen.disponible_real + resumen.ingresos_futuros_mes - resumen.gastos_fijos_pendientes - deudaRestante
  const gastosFijosEfectivo = (gastosFijos ?? [])
    .filter(g => (g.cuentas as any)?.tipo_cuenta !== 'Tarjeta Credito')
    .reduce((acc, g) => acc + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado), 0)
  const proyecciones = []
  let saldo = proyectadoActual
  for (let i = 1; i <= meses; i++) {
    const fecha   = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const periodo = fecha.toISOString().slice(0, 10)
    const [{ data: ingresos }, { data: gastosTC }] = await Promise.all([
      adminClient.from('movimientos').select('monto, moneda').eq('tipo_movimiento', 'Ingreso').eq('periodo_tarjeta', periodo).eq('user_id', userId),
      adminClient.from('movimientos').select('monto, moneda, cuenta_origen').eq('tipo_movimiento', 'Gasto').eq('periodo_tarjeta', periodo).eq('user_id', userId),
    ])
    const totalIng = (ingresos ?? []).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    const totalTC  = (gastosTC ?? []).filter(m => tarjetaIds.has(m.cuenta_origen)).reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
    const proyeccion = saldo + totalIng - gastosFijosEfectivo - totalTC
    saldo = proyeccion
    proyecciones.push({
      periodo, label: fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase()),
      ingresos: Math.round(totalIng), gastos_fijos: Math.round(gastosFijosEfectivo),
      gastos_tarjeta: Math.round(totalTC), proyeccion: Math.round(proyeccion),
    })
  }
  return { proyectadoActual: Math.round(proyectadoActual), proyecciones }
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today    = new Date()
  const todayDay = today.getDate()

  const [{ data: resumen }, { data: cuentas }, { data: gastosFijos }, { data: cuentasExtra }, { proyectadoActual, proyecciones }] =
    await Promise.all([
      adminClient.from('dashboard_resumen').select('*').eq('user_id', user.id).single(),
      adminClient.from('saldo_actual_cuentas').select('*').eq('activa', true).eq('user_id', user.id),
      adminClient.from('gastos_fijos').select('*, cuentas(nombre_cuenta, tipo_cuenta)').eq('activo', true).eq('user_id', user.id).order('dia_vencimiento'),
      adminClient.from('cuentas').select('id, imagen_url, color_primario').eq('user_id', user.id),
      calcularProyecciones(user.id, 4),
    ])

  if (!resumen) return (
    <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
      <p className="text-5xl">🥭</p>
      <h2 className="text-xl font-semibold text-slate-800">¡Bienvenido a sinunmango!</h2>
      <p className="text-slate-500 text-sm">Todavía no tenés cuentas cargadas. Creá tu primera cuenta para ver el dashboard.</p>
      <a
        href="/onboarding"
        className="inline-block mt-2 px-6 py-3 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
      >
        Configurar mi primera cuenta →
      </a>
    </div>
  )

  const extraMap = Object.fromEntries((cuentasExtra ?? []).map(c => [c.id, c]))

  // Mes actual en mayúsculas: "ABRIL 2026"
  const mesLabel = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .toUpperCase().replace(' DE ', ' ')

  const gastosFijosProximos = (gastosFijos ?? [])
    .filter(g => (g.dia_vencimiento ?? 0) >= todayDay)
    .sort((a, b) => (a.dia_vencimiento ?? 0) - (b.dia_vencimiento ?? 0))

  const cuentasEfectivo = (cuentas ?? []).filter(c => c.tipo_cuenta !== 'Tarjeta Credito')
  const tarjetas        = (cuentas ?? []).filter(c => c.tipo_cuenta === 'Tarjeta Credito')

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── HERO BANNER ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden text-white relative"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #0d2137) 0%, var(--accent2, #0d3b6e) 45%, var(--accent, #1a6b5a) 100%)' }}>
        <div className="px-8 py-8">
          <p className="text-5xl font-black tracking-tight text-white/90 leading-none mb-1">
            {mesLabel}
          </p>
          <p className="text-sm text-white/40 uppercase tracking-widest mb-10">Resumen del período</p>

          {/* Dos números principales */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs text-white/50 uppercase tracking-widest mb-2">Saldo disponible</p>
              <p className="text-4xl font-bold text-white">${fmt(resumen.disponible_real)}</p>
              <p className="text-xs text-white/40 mt-1">Suma de billeteras y efectivo ARS</p>
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-widest mb-2">Proyectado fin de mes</p>
              <p className={`text-4xl font-bold ${proyectadoActual >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {proyectadoActual < 0 ? '-' : ''}${fmt(Math.abs(proyectadoActual))}
              </p>
              <p className="text-xs text-white/40 mt-1">Liquidez estimada</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 KPIs ──────────────────────────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">
          Indicadores del mes
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            href="/resumen?tipo=ingresos"
            label="Ingresos actuales"
            value={`$${fmt(resumen.ingresos_actuales)}`}
            sub="Cobrados este mes"
            accent="emerald"
          />
          <KpiCard
            href="/resumen?tipo=gastos"
            label="Gastos actuales"
            value={`$${fmt(resumen.gastos_actuales)}`}
            sub="Gastado en el mes"
            accent="red"
          />
          <KpiCard
            href="/resumen?tipo=tarjetas"
            label="Deuda tarjetas"
            value={`$${fmt(resumen.deuda_tarjetas_periodo)}`}
            sub="Período actual"
            accent="amber"
          />
          <KpiCard
            href="/resumen?tipo=proyectado"
            label="Proyectado EOM"
            value={`${proyectadoActual < 0 ? '-' : ''}$${fmt(Math.abs(proyectadoActual))}`}
            sub="Liquidez estimada"
            accent={proyectadoActual >= 0 ? 'emerald' : 'red'}
          />
        </div>
      </div>

      {/* ── PROYECCIONES MENSUALES ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-8 rounded-full shrink-0"
            style={{ background: 'linear-gradient(to bottom, var(--accent2, #0d3b6e), var(--accent, #1a6b5a))' }} />
          <div className="flex-1 flex items-baseline justify-between gap-4">
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Proyecciones Mensuales</h2>
            <p className="text-xs text-slate-400 hidden sm:block">Basado en movimientos cargados y gastos fijos</p>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {proyecciones.map((p, i) => {
              const esPositivo = p.proyeccion >= 0
              const prev       = i === 0 ? proyectadoActual : proyecciones[i - 1].proyeccion
              const diferencia = p.proyeccion - prev
              return (
                <Link key={p.periodo} href={`/proyeccion?periodo=${p.periodo}`}
                  className="bg-white rounded-xl border border-slate-100 p-4 hover:border-slate-200 hover:shadow-sm transition-all group block relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-14 h-14 rounded-bl-full opacity-20"
                    style={{ background: esPositivo ? '#dcfce7' : '#fee2e2' }} />
                  <p className="text-xs font-medium text-slate-500 mb-2 relative z-10">{p.label}</p>
                  <p className="text-xl font-bold relative z-10" style={{ color: esPositivo ? '#1a6b5a' : '#dc2626' }}>
                    {p.proyeccion < 0 ? '-' : ''}${fmt(Math.abs(p.proyeccion))}
                  </p>
                  <div className="flex items-center gap-1 mt-1 relative z-10">
                    <span className={`text-xs font-medium ${diferencia >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                      {diferencia >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diferencia))}
                    </span>
                    <span className="text-xs text-slate-400">vs anterior</span>
                  </div>
                  <div className="mt-2 space-y-0.5 relative z-10">
                    {p.ingresos > 0 && <p className="text-xs text-slate-400">+${fmt(p.ingresos)} ingresos</p>}
                    <p className="text-xs text-slate-400">-${fmt(p.gastos_fijos + p.gastos_tarjeta)} gastos</p>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 group-hover:text-slate-400 transition-colors relative z-10">Ver detalle →</p>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estado de cuentas */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
            <h2 className="text-sm font-semibold text-slate-700">Estado de cuentas</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {cuentasEfectivo.map(c => {
              const extra = extraMap[c.id]
              return (
                <Link key={c.id} href={`/cuentas/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Thumbnail imagenUrl={extra?.imagen_url} colorPrim={extra?.color_primario ?? '#0d3b6e'} tipo={c.tipo_cuenta} nombre={c.nombre_cuenta} moneda={c.moneda} />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{c.nombre_cuenta}</p>
                      <p className="text-xs text-slate-400">{c.tipo_cuenta}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-semibold ${(c.saldo_actual ?? 0) < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                    {c.moneda === 'USD' ? 'US$' : '$'}{fmt(c.saldo_actual ?? 0)}
                  </p>
                </Link>
              )
            })}
          </div>
          <div className="px-5 py-2" style={{ borderTop: '1px solid var(--border-subtle, #f1f5f9)', background: 'var(--bg-card-alt, #f8fafc)' }}>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tarjetas de crédito</p>
          </div>
          <div className="divide-y divide-slate-50">
            {tarjetas.map(c => {
              const extra  = extraMap[c.id]
              const cierre = c.fecha_cierre_tarjeta ? new Date(c.fecha_cierre_tarjeta + 'T12:00:00').getDate() : '—'
              const vence  = c.fecha_vencimiento_tarjeta ? new Date(c.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : '—'
              return (
                <Link key={c.id} href={`/cuentas/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Thumbnail imagenUrl={extra?.imagen_url} colorPrim={extra?.color_primario ?? '#0d3b6e'} tipo={c.tipo_cuenta} nombre={c.nombre_cuenta} moneda={c.moneda} />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{c.nombre_cuenta}</p>
                      <p className="text-xs text-slate-400">Cierre {cierre} · Vence {vence}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${(c.saldo_actual ?? 0) < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                      ${fmt(c.saldo_actual ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400">acumulado</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Gastos fijos por vencer */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Gastos fijos por vencer</h2>
              <p className="text-xs text-slate-400 mt-0.5">Pendientes este mes · día {todayDay} en adelante</p>
            </div>
            <Link href="/gastos-fijos" className="text-xs text-blue-500 hover:text-blue-700 underline whitespace-nowrap">Ver todos</Link>
          </div>
          {gastosFijosProximos.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-emerald-600 font-medium">✓ Todo al día</p>
              <p className="text-xs text-slate-400 mt-1">No quedan gastos fijos pendientes este mes</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {gastosFijosProximos.map(g => {
                const esTarjeta = (g.cuentas as any)?.tipo_cuenta === 'Tarjeta Credito'
                const hoy       = g.dia_vencimiento === todayDay
                const diasResta = (g.dia_vencimiento ?? 0) - todayDay
                return (
                  <div key={g.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${hoy ? 'bg-red-400 animate-pulse' : diasResta <= 3 ? 'bg-amber-400' : esTarjeta ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                      <div>
                        <p className="text-sm text-slate-700">{g.nombre_gasto}</p>
                        <p className="text-xs text-slate-400">Día {g.dia_vencimiento} · {(g.cuentas as any)?.nombre_cuenta ?? '—'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-medium text-slate-800">${fmt(g.monto_estimado ?? 0)}</p>
                      <p className={`text-xs ${hoy ? 'text-red-500 font-medium' : diasResta <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {hoy ? 'vence hoy' : diasResta === 1 ? 'mañana' : `en ${diasResta} días`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ href, label, value, sub, accent }: {
  href: string; label: string; value: string; sub: string
  accent: 'emerald' | 'red' | 'amber'
}) {
  const styles = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-400', text: 'text-emerald-700' },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',     dot: 'bg-red-400',     text: 'text-red-700'     },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   dot: 'bg-amber-400',   text: 'text-amber-700'   },
  }
  const s = styles[accent] ?? styles.emerald
  return (
    <Link href={href}
      className={`${s.bg} border ${s.border} rounded-xl p-4 hover:shadow-sm transition-all group block`}>
      <div className={`w-2 h-2 rounded-full ${s.dot} mb-3`} />
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <p className={`text-xl font-bold ${s.text} leading-none`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      <p className="text-xs text-slate-300 mt-2 group-hover:text-slate-400 transition-colors">Ver detalle →</p>
    </Link>
  )
}
