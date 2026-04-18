'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Search, X } from 'lucide-react'

type Categoria = { id: string; nombre_categoria: string; icono?: string | null }
type Cuenta    = { id: string; nombre_cuenta: string }

type Props = {
  periodos:   string[]
  categorias: Categoria[]
  cuentas:    Cuenta[]
}

export function MovimientosControls({ periodos, categorias, cuentas }: Props) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  const tipo      = searchParams.get('tipo')     ?? ''
  const periodo   = searchParams.get('periodo')  ?? ''
  const categoria = searchParams.get('categoria') ?? ''
  const cuenta    = searchParams.get('cuenta')   ?? ''
  const q         = searchParams.get('q')        ?? ''

  const hayFiltros = tipo || periodo || categoria || cuenta || q

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else        params.delete(key)
    params.delete('page') // reset a página 1 al filtrar
    router.push(`${pathname}?${params.toString()}`)
  }, [searchParams, pathname, router])

  const limpiar = () => {
    const params = new URLSearchParams()
    // Mantener solo futuros y sort si estaban activos
    if (searchParams.get('futuros')) params.set('futuros', searchParams.get('futuros')!)
    if (searchParams.get('sort'))    params.set('sort',    searchParams.get('sort')!)
    if (searchParams.get('dir'))     params.set('dir',     searchParams.get('dir')!)
    router.push(`${pathname}?${params.toString()}`)
  }

  const formatPeriodo = (p: string) =>
    new Date(p + 'T12:00:00').toLocaleDateString('es-AR', { month: '2-digit', year: 'numeric' })

  const selectClass = `
    px-3 py-2 text-xs border rounded-lg outline-none bg-white transition-colors
    focus:ring-2 focus:ring-blue-100
  `
  const activeClass   = 'border-blue-300 text-blue-700 bg-blue-50'
  const inactiveClass = 'border-slate-200 text-slate-600 hover:border-slate-300'

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
      <div className="flex flex-wrap gap-2 items-center">

        {/* Búsqueda por detalle */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={e => update('q', e.target.value)}
            placeholder="Buscar detalle..."
            className={`pl-8 pr-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-white w-48 transition-colors ${q ? activeClass : inactiveClass}`}
          />
          {q && (
            <button onClick={() => update('q', '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Tipo */}
        <select
          value={tipo}
          onChange={e => update('tipo', e.target.value)}
          className={`${selectClass} ${tipo ? activeClass : inactiveClass}`}
        >
          <option value="">Todos los tipos</option>
          <option value="Gasto">Gasto</option>
          <option value="Ingreso">Ingreso</option>
          <option value="Transferencia">Transferencia</option>
        </select>

        {/* Periodo */}
        <select
          value={periodo}
          onChange={e => update('periodo', e.target.value)}
          className={`${selectClass} ${periodo ? activeClass : inactiveClass}`}
        >
          <option value="">Todos los periodos</option>
          {periodos.map(p => (
            <option key={p} value={p}>{formatPeriodo(p)}</option>
          ))}
        </select>

        {/* Categoría */}
        <select
          value={categoria}
          onChange={e => update('categoria', e.target.value)}
          className={`${selectClass} ${categoria ? activeClass : inactiveClass}`}
        >
          <option value="">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nombre_categoria}</option>
          ))}
        </select>

        {/* Cuenta */}
        <select
          value={cuenta}
          onChange={e => update('cuenta', e.target.value)}
          className={`${selectClass} ${cuenta ? activeClass : inactiveClass}`}
        >
          <option value="">Todas las cuentas</option>
          {cuentas.map(c => (
            <option key={c.id} value={c.id}>{c.nombre_cuenta}</option>
          ))}
        </select>

        {/* Limpiar */}
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 underline transition-colors"
          >
            <X size={11} />Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
