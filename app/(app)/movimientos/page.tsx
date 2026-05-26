import { getAuthedClient } from '@/lib/supabase/server'
import { getCurrentWorkspace } from '@/lib/workspace'
import { stripCuotaSuffix } from '@/lib/tarjeta-periodo'
import { todayAR } from '@/lib/timezone'
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
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId

  const sp       = await searchParams
  const page     = parseInt(sp.page ?? '1')
  const pageSize = 50
  const from     = (page - 1) * pageSize
  const sortCol  = sp.sort ?? 'fecha'
  const sortDir  = sp.dir === 'asc'
  const mostrarFuturos = sp.futuros === '1'
  const today    = todayAR()

  const allowed  = ['fecha', 'monto_estimado', 'periodo_tarjeta', 'categoria']
  const orderCol = allowed.includes(sortCol) ? sortCol : 'fecha'

  // Scoping del listado:
  // - Owner: filtra por user_id = wsId (sus propios movs).
  // - Invitee: NO podemos filtrar por user_id porque dejaríamos afuera los
  //   movs que el propio invitee cargó en cuentas compartidas (user_id =
  //   invitee.id ≠ wsId). Filtramos por cuenta IN (recursos compartidos),
  //   y dejamos que RLS valide visibilidad de cada mov.
  //   Resultado: el invitee ve TODO en las cuentas compartidas (suyo + del
  //   owner) y solo eso — no se filtra data de otros workspaces.
  const cuentasAccesibles = workspace.isOwn
    ? null
    : Array.from(workspace.resources?.cuentas ?? [])

  let query = supabase
    .from('movimientos_completos')
    .select('*', { count: 'exact' })
    .order(orderCol, { ascending: sortDir })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (workspace.isOwn) {
    query = query.eq('user_id', wsId)
  } else if (cuentasAccesibles && cuentasAccesibles.length > 0) {
    // .in() en cuenta_origen O cuenta_destino vía .or() de Postgrest.
    const inList = cuentasAccesibles.map(id => `"${id}"`).join(',')
    query = query.or(`cuenta_origen.in.(${inList}),cuenta_destino.in.(${inList})`)
  } else {
    // Invitee sin cuentas compartidas — devolver vacío sin pegarle a la DB.
    query = query.eq('id', '__no_match__')
  }

  if (!mostrarFuturos) query = query.lte('fecha', today)
  if (sp.tipo     && sp.tipo !== 'Todos') query = query.eq('tipo_movimiento', sp.tipo)
  if (sp.periodo)   query = query.eq('periodo_tarjeta', sp.periodo)
  if (sp.categoria) query = query.eq('categoria', sp.categoria)
  if (sp.cuenta)    query = query.eq('cuenta_origen', sp.cuenta)
  if (sp.q)         query = query.ilike('detalle', `%${sp.q}%`)

  // Mismo scoping para countFuturos y periodos. Para cuentas y categorias
  // mostramos los del workspace (sirve para los filtros del picker).
  const futurosQuery = supabase.from('movimientos').select('*', { count: 'exact', head: true }).gt('fecha', today)
  const periodosQuery = supabase.from('movimientos').select('periodo_tarjeta').order('periodo_tarjeta', { ascending: false })
  if (workspace.isOwn) {
    futurosQuery.eq('user_id', wsId)
    periodosQuery.eq('user_id', wsId)
  } else if (cuentasAccesibles && cuentasAccesibles.length > 0) {
    const inList = cuentasAccesibles.map(id => `"${id}"`).join(',')
    futurosQuery.or(`cuenta_origen.in.(${inList}),cuenta_destino.in.(${inList})`)
    periodosQuery.or(`cuenta_origen.in.(${inList}),cuenta_destino.in.(${inList})`)
  } else {
    futurosQuery.eq('id', '__no_match__')
    periodosQuery.eq('id', '__no_match__')
  }

  // Picker de cuentas: invitee solo ve las cuentas compartidas. Owner ve todas.
  const cuentasPickerQuery = supabase.from('cuentas')
    .select('id, nombre_cuenta')
    .eq('activa', true)
    .eq('user_id', wsId)
    .order('nombre_cuenta')
  if (!workspace.isOwn && cuentasAccesibles) {
    if (cuentasAccesibles.length > 0) {
      cuentasPickerQuery.in('id', cuentasAccesibles)
    } else {
      cuentasPickerQuery.eq('id', '__no_match__')
    }
  }

  const [
    { data: movimientos, count },
    { data: periodosRaw },
    { data: categorias },
    { data: cuentas },
    { count: countFuturos },
  ] = await Promise.all([
    query,
    periodosQuery,
    supabase.from('categorias').select('id, nombre_categoria, icono').eq('user_id', wsId).order('nombre_categoria'),
    cuentasPickerQuery,
    futurosQuery,
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

      {/* Header: en mobile stack vertical (título full-width arriba + botones
          abajo en fila); en sm+ vuelve a single-row con título a la izq y
          botones a la der. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <h1 className="text-xl font-semibold text-slate-800">
          Movimientos
          {count != null && <span className="text-sm font-normal text-slate-400 ml-2">({count} total)</span>}
        </h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={buildUrl({ futuros: mostrarFuturos ? '' : '1', page: '1' })}
            className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors whitespace-nowrap ${
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
            className="text-sm text-white px-4 py-2 rounded-lg font-medium whitespace-nowrap ml-auto sm:ml-0"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            <span className="sm:hidden">+ Nuevo</span>
            <span className="hidden sm:inline">Nuevo movimiento</span>
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

        {/* ── Mobile: card-list ───────────────────────────────────────────────
            En mobile (< sm) la tabla está oculta y mostramos cada movimiento
            como card. La card entera es <Link> a editar (el botón Pencil
            de la tabla desktop deja de ser necesario). Mostramos TODOS los
            datos importantes que la tabla escondía (categoría, período,
            cuenta) sin truncar nada crítico. */}
        <div className="sm:hidden">
          {(movimientos ?? []).length === 0 ? (
            <p className="text-center py-16 text-slate-400 text-sm">
              No hay movimientos con estos filtros
            </p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {(movimientos ?? []).map(mov => {
                const isIngreso = mov.tipo_movimiento === 'Ingreso'
                const isTransf  = mov.tipo_movimiento === 'Transferencia'
                const isFuturo  = (mov.fecha ?? '') > today
                const periodo   = mov.periodo_tarjeta
                  ? new Date(mov.periodo_tarjeta + 'T12:00:00')
                      .toLocaleDateString('es-AR', { month: '2-digit', year: 'numeric' })
                  : null

                return (
                  <li key={mov.id} className={isFuturo ? 'opacity-60' : ''}>
                    <Link
                      href={`/movimientos/${mov.id}/editar`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                    >
                      {/* Icono de categoría a la izquierda */}
                      <div className="shrink-0 mt-0.5">
                        <IconoCategoria icono={mov.categoria_icono} size={22} />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Fila 1: detalle + monto */}
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-slate-700 text-sm leading-snug min-w-0 break-words">
                            {stripCuotaSuffix(mov.detalle) || '—'}
                          </p>
                          <p className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap ${
                            isIngreso ? 'text-emerald-600' : isTransf ? 'text-blue-500' : 'text-slate-800'
                          }`}>
                            {isIngreso ? '+' : isTransf ? '' : '-'}${fmt(mov.monto_estimado ?? mov.monto ?? 0)}
                          </p>
                        </div>

                        {/* Fila 2: categoría · cuenta */}
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {mov.categoria_nombre ?? '—'}
                          {mov.cuenta_origen_nombre && (
                            <>
                              <span className="text-slate-300"> · </span>
                              <span className="text-slate-400">{mov.cuenta_origen_nombre}</span>
                            </>
                          )}
                        </p>

                        {/* Fila 3: fecha + cuota + período + badge futuro */}
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs">
                          <span className={isFuturo ? 'text-blue-400 font-medium tabular-nums' : 'text-slate-400 tabular-nums'}>
                            {mov.fecha}
                          </span>
                          {(mov.cuotas_total ?? 0) > 1 && (
                            <span className="text-slate-400">
                              · Cuota {Math.min(mov.cuota_actual ?? 0, mov.cuotas_total ?? 0)}/{Math.max(mov.cuota_actual ?? 0, mov.cuotas_total ?? 0)}
                            </span>
                          )}
                          {periodo && (
                            <span className="text-slate-400">
                              · Per. <span className="font-mono">{periodo}</span>
                            </span>
                          )}
                          {isFuturo && (
                            <span className="bg-blue-50 text-blue-400 px-1.5 py-0.5 rounded">futuro</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Desktop / tablet: tabla (sm+) ──────────────────────────────── */}
        <div className="hidden sm:block overflow-x-auto">
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
                const isFuturo  = (mov.fecha ?? '') > today
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
                      {(mov.cuotas_total ?? 0) > 1 && (
                        <p className="text-xs text-slate-400">Cuota {Math.min(mov.cuota_actual ?? 0, mov.cuotas_total ?? 0)}/{Math.max(mov.cuota_actual ?? 0, mov.cuotas_total ?? 0)}</p>
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
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap tabular-nums ${
                      isIngreso ? 'text-emerald-600' : isTransf ? 'text-blue-500' : 'text-slate-800'
                    }`}>
                      {isIngreso ? '+' : isTransf ? '' : '-'}${fmt(mov.monto_estimado ?? mov.monto ?? 0)}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/movimientos/${mov.id}/editar`}
                        className="inline-flex items-center justify-center p-2.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400 truncate">Página {page} de {totalPages} · <span className="hidden sm:inline">{count} registros</span><span className="sm:hidden">{count} regs</span></p>
            <div className="flex gap-2 shrink-0">
              {page > 1 && (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="text-sm px-4 py-2 border border-slate-200 rounded-lg hover:bg-white text-slate-600 transition-colors"
                >
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="text-sm px-4 py-2 border border-slate-200 rounded-lg hover:bg-white text-slate-600 transition-colors"
                >
                  Siguiente
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
