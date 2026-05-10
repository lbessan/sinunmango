import { getAuthedClient } from '@/lib/supabase/server'
import { stripCuotaSuffix } from '@/lib/tarjeta-periodo'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Pencil, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Suspense } from 'react'
import { MovimientosControls } from '@/components/movimientos-controls'
import { IconoCategoria } from '@/components/icono-categoria'

export const dynamic = 'force-dynamic'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type SP = {
  tipo?: string; periodo?: string; categoria?: string; cuenta?: string
  q?: string; sort?: string; dir?: string; page?: string; futuros?: string
}

function SortHeader({ col, label, currentSort, currentDir, sp }: {
  col: string; label: string; currentSort: string; currentDir: string; sp: SP
}) {
  const isActive = currentSort === col
  const nextDir  = isActive && currentDir === 'desc' ? 'asc' : 'desc'
  const params   = new URLSearchParams()
  Object.entries({ ...sp, sort: col, dir: nextDir }).forEach(([k, v]) => { if (v) params.set(k, v) })
  params.delete('page')

  return (
    <Link href={`/movimientos?${params.toString()}`} className="flex items-center gap-1 hover:text-slate-600 transition-colors">
      {label}
      {!isActive && <ArrowUpDown size={11} className="text-slate-300" />}
      {isActive && currentDir === 'asc'  && <ArrowUp   size={11} className="text-emerald-500" />}
      {isActive && currentDir === 'desc' && <ArrowDown size={11} className="text-emerald-500" />}
    </Link>
  )
}

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const sp       = await searchParams
  const page     = parseInt(sp.page ?? '1')
  const pageSize = 50
  const from     = (page - 1) * pageSize
  const sortCol  = sp.sort ?? 'fecha'
  const sortDir  = sp.dir === 'asc'
  const mostrarFuturos = sp.futuros === '1'
  const today    = new Date().toISOString().slice(0, 10)

  const allowed  = ['fecha', 'monto_estimado', 'periodo_tarjeta', 'categoria']
  const orderCol = allowed.includes(sortCol) ? sortCol : 'fecha'

  let query = supabase
    .from('movimientos_completos')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order(orderCol, { ascending: sortDir })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (!mostrarFuturos) query = query.lte('fecha', today)
  if (sp.tipo     && sp.tipo !== 'Todos') query = query.eq('tipo_movimiento', sp.tipo)
  if (sp.periodo)   query = query.eq('periodo_tarjeta', sp.periodo)
  if (sp.categoria) query = query.eq('categoria', sp.categoria)
  if (sp.cuenta)    query = query.eq('cuenta_origen', sp.cuenta)
  if (sp.q)         query = query.ilike('detalle', `%${sp.q}%`)

  const [
    { data: movimientos, count },
    { data: periodosRaw },
    { data: categorias },
    { data: cuentas },
    { count: countFuturos },
  ] = await Promise.all([
    query,
    supabase.from('movimientos').select('periodo_tarjeta').eq('user_id', user.id).order('periodo_tarjeta', { ascending: false }),
    supabase.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
    supabase.from('cuentas').select('id, nombre_cuenta').eq('activa', true).eq('user_id', user.id).order('nombre_cuenta'),
    supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gt('fecha', today),
  ])

  const totalPages = Math.ceil((count ?? 0) / pageSize)
  const periodos   = [...new Set((periodosRaw ?? []).map(p => p.periodo_tarjeta).filter(Boolean))] as string[]

  const buildUrl = (overrides: Partial<SP>) => {
    const p = { ...sp, ...overrides }
    const params = new URLSearchParams()
    Object.entries(p).forEach(([k, v]) => { if (v) params.set(k, v) })
    return `/movimientos?${params.toString()}`
  }

  const thClass = 'text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-3 font-medium whitespace-nowrap'

  return (
    <div className="max-w-6xl mx-auto">

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-slate-800">
          Movimientos
          {count != null && <span className="text-sm font-normal text-slate-400 ml-2">({count} total)</span>}
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href={buildUrl({ futuros: mostrarFuturos ? '' : '1', page: '1' })}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              mostrarFuturos
                ? 'text-white border-transparent'
                : 'text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            style={mostrarFuturos ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
          >
            {mostrarFuturos
              ? 'Ocultar futuros'
              : `Ver futuros${countFuturos ? ` (${countFuturos})` : ''}`}
          </Link>
          <Link
            href="/movimientos/nuevo"
            className="text-sm text-white px-4 py-2 rounded-lg font-medium"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            Nuevo movimiento
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <MovimientosControls
          periodos={periodos}
          categorias={categorias ?? []}
          cuentas={cuentas ?? []}
        />
      </Suspense>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className={thClass}>
                  <SortHeader col="fecha" label="Fecha" currentSort={sortCol} currentDir={sp.dir ?? 'desc'} sp={sp} />
                </th>
                <th className={thClass}>Detalle</th>
                <th className={`${thClass} hidden sm:table-cell`}>
                  <SortHeader col="categoria" label="Categoría" currentSort={sortCol} currentDir={sp.dir ?? 'desc'} sp={sp} />
                </th>
                <th className={`${thClass} hidden md:table-cell`}>
                  <SortHeader col="periodo_tarjeta" label="Periodo" currentSort={sortCol} currentDir={sp.dir ?? 'desc'} sp={sp} />
                </th>
                <th className={`${thClass} hidden md:table-cell`}>Cuenta</th>
                <th className={thClass}>
                  <SortHeader col="monto_estimado" label="Monto ARS" currentSort={sortCol} currentDir={sp.dir ?? 'desc'} sp={sp} />
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(movimientos ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 text-sm">
                    No hay movimientos con estos filtros
                  </td>
                </tr>
              )}
              {(movimientos ?? []).map(mov => {
                const isIngreso = mov.tipo_movimiento === 'Ingreso'
                const isTransf  = mov.tipo_movimiento === 'Transferencia'
                const isFuturo  = mov.fecha > today
                const periodo   = mov.periodo_tarjeta
                  ? new Date(mov.periodo_tarjeta + 'T12:00:00')
                      .toLocaleDateString('es-AR', { month: '2-digit', year: 'numeric' })
                  : '—'

                return (
                  <tr
                    key={mov.id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${isFuturo ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <span className={isFuturo ? 'text-blue-400 font-medium' : 'text-slate-400'}>
                        {mov.fecha}
                      </span>
                      {isFuturo && (
                        <span className="ml-1.5 text-xs bg-blue-50 text-blue-400 px-1.5 py-0.5 rounded">futuro</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700 max-w-xs truncate">{stripCuotaSuffix(mov.detalle) || '—'}</p>
                      {mov.cuotas_total > 1 && (
                        <p className="text-xs text-slate-400">Cuota {Math.min(mov.cuota_actual, mov.cuotas_total)}/{Math.max(mov.cuota_actual, mov.cuotas_total)}</p>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-600 whitespace-nowrap text-sm">
                      <span className="flex items-center gap-1.5">
                        <IconoCategoria icono={mov.categoria_icono} size={16} />
                        {mov.categoria_nombre ?? '—'}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">{periodo}</span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{mov.cuenta_origen_nombre ?? '—'}</td>
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap ${
                      isIngreso ? 'text-emerald-600' : isTransf ? 'text-blue-500' : 'text-slate-800'
                    }`}>
                      {isIngreso ? '+' : isTransf ? '' : '-'}${fmt(mov.monto_estimado ?? mov.monto)}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/movimientos/${mov.id}/editar`} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors inline-flex">
                        <Pencil size={13} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-400">Página {page} de {totalPages} · {count} registros</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={buildUrl({ page: String(page - 1) })} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-white text-slate-600">Anterior</Link>
              )}
              {page < totalPages && (
                <Link href={buildUrl({ page: String(page + 1) })} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-white text-slate-600">Siguiente</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
