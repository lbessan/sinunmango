import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, ArrowDownCircle } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

type GastoFijo = {
  id: string
  nombre_gasto: string
  monto_estimado: number
  moneda: string | null
  dia_vencimiento: number | null
  activo: boolean
  cuentas: { id: string; nombre_cuenta: string; tipo_cuenta: string } | null
  categorias: { id: string; nombre_categoria: string; icono: string | null } | null
}

export default async function GastosFijosPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [{ data: gastosRaw }, { data: params }] = await Promise.all([
    adminClient.from('gastos_fijos')
      .select('*, cuentas(id, nombre_cuenta, tipo_cuenta), categorias(id, nombre_categoria, icono)')
      .eq('user_id', user.id)
      .order('dia_vencimiento'),
    adminClient.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', user.id).single(),
  ])

  const dolarBna = params?.valor ?? 1410
  const today    = new Date().getDate()
  const gastos   = (gastosRaw ?? []) as unknown as GastoFijo[]
  const activos  = gastos.filter(g => g.activo)
  const inactivos = gastos.filter(g => !g.activo)

  const montoEnARS = (g: GastoFijo) =>
    g.moneda === 'USD' ? g.monto_estimado * dolarBna : g.monto_estimado

  const totalMensual = activos.reduce((acc, g) => acc + montoEnARS(g), 0)

  // Agrupar activos por categoría, ordenados por mayor total
  const grupos = activos.reduce<Record<string, {
    cat: { id: string; nombre_categoria: string; icono: string | null }
    items: GastoFijo[]
    total: number
  }>>((acc, g) => {
    const cat = g.categorias
    const key = cat?.id ?? 'sin-categoria'
    if (!acc[key]) {
      acc[key] = {
        cat: cat ?? { id: 'sin-categoria', nombre_categoria: 'Sin categoría', icono: null },
        items: [],
        total: 0,
      }
    }
    acc[key].items.push(g)
    acc[key].total += montoEnARS(g)
    return acc
  }, {})

  const gruposOrdenados = Object.values(grupos).sort((a, b) => b.total - a.total)

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Gastos fijos</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            Total mensual: <span className="font-semibold text-slate-800">${fmt(totalMensual)}</span>
          </span>
          <Link href="/gastos-fijos/nuevo"
            className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
            <Plus size={15} />Nuevo
          </Link>
        </div>
      </div>

      {/* Activos agrupados */}
      {gruposOrdenados.map(({ cat, items, total }) => (
        <div key={cat.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconoCategoria icono={cat.icono} size={22} />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                {cat.nombre_categoria}
              </p>
              <span className="text-xs text-slate-400">({items.length})</span>
            </div>
            <p className="text-sm font-semibold text-slate-700">${fmt(total)}</p>
          </div>

          {items.map(g => {
            const cuenta  = g.cuentas
            const monto   = montoEnARS(g)
            const vencido = (g.dia_vencimiento ?? 0) < today
            const hoy     = g.dia_vencimiento === today
            const pagoParams = new URLSearchParams({
              detalle:   g.nombre_gasto,
              monto:     String(g.monto_estimado),
              moneda:    g.moneda ?? 'ARS',
              cuenta:    cuenta?.id ?? '',
              categoria: g.categorias?.id ?? '',
            })
            return (
              <div key={g.id} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${hoy ? 'bg-amber-400' : vencido ? 'bg-slate-300' : 'bg-emerald-400'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-700">{g.nombre_gasto}</p>
                      {g.moneda === 'USD' && (
                        <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">USD</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {g.dia_vencimiento ? `Día ${g.dia_vencimiento}` : '—'}
                      {cuenta?.nombre_cuenta ? ` · ${cuenta.nombre_cuenta}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <div className="text-right mr-1">
                    <p className="text-sm font-semibold text-slate-800">${fmt(monto)}</p>
                    {g.moneda === 'USD' && <p className="text-xs text-slate-400">US${g.monto_estimado}</p>}
                    <p className={`text-xs ${hoy ? 'text-amber-500' : vencido ? 'text-slate-300' : 'text-emerald-500'}`}>
                      {hoy ? 'vence hoy' : vencido ? 'vencido' : 'pendiente'}
                    </p>
                  </div>
                  <Link href={`/movimientos/nuevo?${pagoParams.toString()}`}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap">
                    <ArrowDownCircle size={12} />Registrar pago
                  </Link>
                  <Link href={`/gastos-fijos/${g.id}/editar`}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                    <Pencil size={14} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Inactivos */}
      {inactivos.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Inactivos ({inactivos.length})
            </p>
          </div>
          {inactivos.map(g => {
            const cuenta = g.cuentas
            const monto  = montoEnARS(g)
            return (
              <div key={g.id} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-slate-200" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-400">{g.nombre_gasto}</p>
                      <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">inactivo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IconoCategoria icono={g.categorias?.icono ?? null} size={12} />
                      <p className="text-xs text-slate-400">
                        {g.categorias?.nombre_categoria}
                        {g.dia_vencimiento ? ` · Día ${g.dia_vencimiento}` : ''}
                        {cuenta?.nombre_cuenta ? ` · ${cuenta.nombre_cuenta}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <p className="text-sm font-semibold text-slate-400">${fmt(monto)}</p>
                  <Link href={`/gastos-fijos/${g.id}/editar`}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                    <Pencil size={14} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
