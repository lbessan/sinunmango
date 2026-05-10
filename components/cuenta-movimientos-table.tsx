'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Pencil, Plus, X, ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react'
import { NuevoItemModal } from '@/components/nuevo-item-modal'
import { IconoCategoria } from '@/components/icono-categoria'
import { CategoriaSelect } from '@/components/categoria-select'
import { calcularPeriodo, addMonths } from '@/lib/tarjeta-periodo'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Mov = {
  id: string; fecha: string; detalle: string | null
  monto: number; monto_estimado: number | null; tipo_movimiento: string
  cuenta_origen: string; cuenta_destino: string | null
  categoria_icono: string | null; categoria_nombre: string | null
  periodo_tarjeta: string | null; cuotas_total: number; cuota_actual: number
}
type Categoria    = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }
type CuentaItem   = { id: string; nombre_cuenta: string }

// calcularPeriodo + addMonths importados de @/lib/tarjeta-periodo
function formatPeriodo(p: string): string {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

// ─── Modal agregar movimiento ─────────────────────────────────────────────────
function AddMovModal({ cuentaId, isTarjeta, cierreDay, venceDay, categorias: catInicial, subcategorias: subInicial, cuentas, onAdd, onClose }: {
  cuentaId: string
  isTarjeta: boolean
  cierreDay: number | null
  venceDay: number | null
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  cuentas?: CuentaItem[]
  onAdd: (movs: Mov[]) => void
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [fecha,         setFecha]         = useState(today)
  const [detalle,       setDetalle]       = useState('')
  const [monto,         setMonto]         = useState('')
  const [moneda,        setMoneda]        = useState('ARS')
  const [cotizacion,    setCotizacion]    = useState('')
  const [conciliado,    setConciliado]    = useState(false)
  const [tipo,          setTipo]          = useState('Gasto')
  const [cuotas,        setCuotas]        = useState(1)
  const [categorias,    setCategorias]    = useState(catInicial)
  const [subcats,       setSubcats]       = useState(subInicial)
  const [catId,         setCatId]         = useState(catInicial.find((c: any) => c.tipo_default === 'Gasto')?.id ?? catInicial[0]?.id ?? '')
  const [subcatId,      setSubcatId]      = useState('')
  const [cuentaDestino, setCuentaDestino] = useState(cuentas?.[0]?.id ?? '')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [miniModal,     setMiniModal]     = useState<'categoria' | 'subcategoria' | null>(null)

  const subcatsFiltradas = subcats.filter(s => s.categoria_padre === catId)
  const isUSD = moneda === 'USD'

  // Período calculado para la primera cuota
  const periodoCalculado = useMemo(() =>
    calcularPeriodo(fecha, cierreDay, venceDay, isTarjeta && tipo === 'Gasto'),
    [fecha, cierreDay, venceDay, isTarjeta, tipo]
  )

  // Preview de cuotas: [{ cuota, fecha, periodo }]
  const previewCuotas = useMemo(() => {
    if (cuotas <= 1) return []
    return Array.from({ length: cuotas }, (_, i) => {
      const f = addMonths(fecha, i)
      const p = calcularPeriodo(f, cierreDay, venceDay, isTarjeta && tipo === 'Gasto')
      return { cuota: i + 1, fecha: f, periodo: p }
    })
  }, [cuotas, fecha, cierreDay, venceDay, isTarjeta, tipo])

  const handleAgregar = async () => {
    if (!monto || !fecha) { setError('Fecha y monto son obligatorios'); return }
    setSaving(true)

    const montoNum    = parseFloat(monto)
    const montoCuota  = cuotas > 1 ? montoNum / cuotas : montoNum
    const cat         = categorias.find(c => c.id === catId)

    // Generar N movimientos (uno por cuota, 1 para transferencia)
    const isTransf = tipo === 'Transferencia'
    const nuevosMovs = Array.from({ length: isTransf ? 1 : cuotas }, (_, i) => {
      const fechaCuota   = addMonths(fecha, i)
      const periodoCuota = calcularPeriodo(fechaCuota, cierreDay, venceDay, isTarjeta && tipo === 'Gasto')
      return {
        id:              crypto.randomUUID(),
        fecha:           fechaCuota,
        detalle:         detalle ? (cuotas > 1 && !isTransf ? `${detalle} (Cuota ${i + 1})` : detalle) : null,
        monto:           montoCuota,
        moneda,
        tipo_movimiento: tipo,
        cuenta_origen:   cuentaId,
        cuenta_destino:  isTransf ? (cuentaDestino || null) : null,
        categoria:       catId || null,
        subcategoria:    subcatId || null,
        cotizacion:      isUSD && cotizacion ? parseFloat(cotizacion) : null,
        conciliado,
        periodo_tarjeta: periodoCuota,
        cuotas_total:    isTransf ? 1 : cuotas,
        cuota_actual:    i + 1,
        ciclo_actual:    1,
      }
    })

    const res = await fetch('/api/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevosMovs),
    })
    setSaving(false)

    if (res.ok) {
      const destNombre = cuentas?.find(c => c.id === cuentaDestino)?.nombre_cuenta ?? null
      const primeraMov: Mov = {
        id:               nuevosMovs[0].id,
        fecha:            nuevosMovs[0].fecha,
        detalle:          nuevosMovs[0].detalle,
        monto:            montoCuota,
        monto_estimado:   isUSD && cotizacion ? montoCuota * parseFloat(cotizacion) : montoCuota,
        tipo_movimiento:  tipo,
        cuenta_origen:    cuentaId,
        cuenta_destino:   isTransf ? (cuentaDestino || null) : null,
        categoria_icono:  cat?.icono ?? null,
        categoria_nombre: cat?.nombre_categoria ?? (isTransf && destNombre ? `→ ${destNombre}` : null),
        periodo_tarjeta:  nuevosMovs[0].periodo_tarjeta,
        cuotas_total:     isTransf ? 1 : cuotas,
        cuota_actual:     1,
      }
      onAdd([primeraMov])
      onClose()
    } else {
      const d = await res.json(); setError(d.error ?? 'Error')
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white'

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
            <h3 className="text-sm font-semibold text-slate-800">Agregar movimiento</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Tipo */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              {['Gasto', 'Ingreso', 'Transferencia'].map(t => (
                <button key={t} onClick={() => { setTipo(t); setSubcatId(''); if (t !== 'Gasto') setCuotas(1) }}
                  className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all ${tipo === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Cuenta destino — solo para Transferencia */}
            {tipo === 'Transferencia' && (
              <div className="space-y-3 bg-slate-50 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Desde</span>
                  <span className="font-medium text-slate-700">Esta cuenta (origen)</span>
                </div>
                <div className="flex items-center justify-center text-slate-300 text-base">↓</div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Hacia (cuenta destino)</label>
                  {(cuentas ?? []).length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      No hay otras cuentas disponibles. Creá otra cuenta primero.
                    </p>
                  ) : (
                    <select value={cuentaDestino} onChange={e => setCuentaDestino(e.target.value)} className={inputClass}>
                      <option value="">— elegir cuenta —</option>
                      {(cuentas ?? []).map(c => (
                        <option key={c.id} value={c.id}>{c.nombre_cuenta}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Detalle</label>
                <input type="text" value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Ej: Supermercado" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Moneda</label>
                <select value={moneda} onChange={e => setMoneda(e.target.value)} className={inputClass}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Monto total *</label>
                <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" className={`${inputClass} font-mono`} />
              </div>
            </div>

            {isUSD && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3 items-center">
                <div className="flex-1">
                  <label className="block text-xs text-amber-700 mb-1">Cotización</label>
                  <input type="number" step="0.01" value={cotizacion} onChange={e => setCotizacion(e.target.value)} placeholder="Ej: 1410" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none bg-white" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-4">
                  <input type="checkbox" checked={conciliado} onChange={e => setConciliado(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs text-amber-700">Conciliado</span>
                </label>
              </div>
            )}

            {/* Cuotas — solo para Gasto en tarjeta */}
            {tipo === 'Gasto' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cuotas</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={48} value={cuotas}
                    onChange={e => setCuotas(Math.max(1, parseInt(e.target.value) || 1))}
                    className={`${inputClass} w-24 font-mono`}
                  />
                  {cuotas > 1 && monto && (
                    <span className="text-xs text-slate-500">
                      = ${fmt(parseFloat(monto) / cuotas)} / cuota
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Preview periodo */}
            {tipo === 'Gasto' && fecha && (
              <div className={`rounded-xl px-4 py-3 text-xs ${cuotas > 1 ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}`}>
                {cuotas <= 1 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Periodo que impacta</span>
                    <span className="font-semibold text-slate-700">{formatPeriodo(periodoCalculado)}</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-blue-600 font-medium mb-2">{cuotas} cuotas — distribución de períodos:</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {previewCuotas.map(({ cuota, periodo }) => (
                        <div key={cuota} className="flex justify-between text-slate-600">
                          <span>Cuota {cuota}/{cuotas}</span>
                          <span className="font-medium">{formatPeriodo(periodo)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Categoría y subcategoría — siempre disponibles */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Categoría</label>
                <button onClick={() => setMiniModal('categoria')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"><Plus size={11} /> Nueva</button>
              </div>
              <CategoriaSelect
                categorias={categorias as any[]}
                value={catId}
                onChange={id => { setCatId(id); setSubcatId('') }}
                filtroTipo={tipo === 'Transferencia' ? undefined : tipo}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Subcategoría</label>
                <button onClick={() => setMiniModal('subcategoria')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"><Plus size={11} /> Nueva</button>
              </div>
              <select value={subcatId} onChange={e => setSubcatId(e.target.value)} className={inputClass} disabled={subcatsFiltradas.length === 0}>
                <option value="">{subcatsFiltradas.length === 0 ? '(sin subcats)' : '— elegir —'}</option>
                {subcatsFiltradas.map(s => <option key={s.id} value={s.id}>{s.nombre_subcategoria}</option>)}
              </select>
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          </div>

          <div className="px-5 pb-5 flex gap-3 sticky bottom-0 bg-white border-t border-slate-100 pt-4">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button onClick={handleAgregar} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
              <Plus size={13} />{saving ? 'Guardando...' : cuotas > 1 ? `Agregar ${cuotas} cuotas` : 'Agregar'}
            </button>
          </div>
        </div>
      </div>

      {miniModal === 'categoria' && (
        <NuevoItemModal tipo="categoria" categorias={categorias}
          onCreado={(id, nombre, icono) => { setCategorias(prev => [...prev, { id, nombre_categoria: nombre, icono: icono ?? null, tipo_default: tipo }]); setCatId(id) }}
          onClose={() => setMiniModal(null)} zIndex={70} />
      )}
      {miniModal === 'subcategoria' && (
        <NuevoItemModal tipo="subcategoria" categorias={categorias} categoriaActual={catId}
          onCreado={(id, nombre) => { setSubcats(prev => [...prev, { id, nombre_subcategoria: nombre, categoria_padre: catId }]); setSubcatId(id) }}
          onClose={() => setMiniModal(null)} zIndex={70} />
      )}
    </>
  )
}

// ─── Tabla principal ──────────────────────────────────────────────────────────
type SortKey = 'fecha' | 'detalle' | 'categoria_nombre' | 'periodo_tarjeta' | 'monto_estimado'

export function CuentaMovimientosTable({
  movimientos: inicial, cuentaId, categorias, subcategorias, futuro = false,
  isTarjeta, cierreDay, venceDay, cuentas, onMovimientoAgregado,
}: {
  movimientos: Mov[]; cuentaId: string
  categorias: Categoria[]; subcategorias: Subcategoria[]; futuro?: boolean
  isTarjeta?: boolean; cierreDay?: number | null; venceDay?: number | null
  cuentas?: CuentaItem[]
  onMovimientoAgregado?: (movs: Mov[]) => void
}) {
  const [movs,      setMovs]      = useState(inicial)
  const [agregando, setAgregando] = useState(false)
  const [busqueda,  setBusqueda]  = useState('')
  const [sortKey,   setSortKey]   = useState<SortKey>('fecha')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>(futuro ? 'asc' : 'desc')
  const [tipoBadge, setTipoBadge] = useState('')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtrados = useMemo(() => {
    let lista = [...movs]
    if (busqueda) {
      const q = busqueda.toLowerCase()
      lista = lista.filter(m => m.detalle?.toLowerCase().includes(q) || m.categoria_nombre?.toLowerCase().includes(q))
    }
    if (tipoBadge) lista = lista.filter(m => m.tipo_movimiento === tipoBadge)
    lista.sort((a, b) => {
      let av: any = a[sortKey] ?? ''; let bv: any = b[sortKey] ?? ''
      if (sortKey === 'monto_estimado') { av = a.monto_estimado ?? a.monto; bv = b.monto_estimado ?? b.monto }
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
    })
    return lista
  }, [movs, busqueda, tipoBadge, sortKey, sortDir])

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={11} className="text-slate-300" />
    return sortDir === 'asc' ? <ArrowUp size={11} className="text-emerald-500" /> : <ArrowDown size={11} className="text-emerald-500" />
  }
  const Th = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th className={`text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-2.5 font-medium whitespace-nowrap ${right ? 'text-right' : ''}`}>
      <button onClick={() => toggleSort(col)} className={`flex items-center gap-1 hover:text-slate-600 transition-colors ${right ? 'ml-auto' : ''}`}>
        {label}<SortIcon col={col} />
      </button>
    </th>
  )

  const handleAdd = (nuevos: Mov[]) => {
    setMovs(prev => [...nuevos, ...prev])
    onMovimientoAgregado?.(nuevos)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-white w-44" />
          </div>
          <div className="flex gap-1">
            {['', 'Gasto', 'Ingreso', 'Transferencia'].map(t => (
              <button key={t || 'all'} onClick={() => setTipoBadge(t)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${tipoBadge === t ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                style={tipoBadge === t ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
                {t || 'Todos'}
              </button>
            ))}
          </div>
          {(busqueda || tipoBadge) && (
            <button onClick={() => { setBusqueda(''); setTipoBadge('') }} className="text-xs text-slate-400 hover:text-slate-600 underline">Limpiar</button>
          )}
          <span className="text-xs text-slate-400">{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
        </div>
        {!futuro && (
          <button onClick={() => setAgregando(true)}
            className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
            <Plus size={13} />Agregar movimiento
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <p className="text-center py-10 text-slate-400 text-sm">
          {busqueda || tipoBadge ? 'Sin resultados para este filtro' : 'Sin movimientos'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <Th col="fecha" label="Fecha" />
                <Th col="detalle" label="Detalle" />
                <Th col="categoria_nombre" label="Categoría" />
                {!futuro && <Th col="periodo_tarjeta" label="Periodo" />}
                <Th col="monto_estimado" label="Monto" right />
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(mov => {
                const isIngreso = mov.tipo_movimiento === 'Ingreso'
                const isTransf  = mov.tipo_movimiento === 'Transferencia'
                const esDestino = mov.cuenta_destino === cuentaId
                let signo = '-'; let colorClass = 'text-slate-800'
                if (isTransf) { if (esDestino) { signo = '+'; colorClass = 'text-emerald-600' } }
                else if (isIngreso) { signo = '+'; colorClass = 'text-emerald-600' }
                const periodo = mov.periodo_tarjeta
                  ? new Date(mov.periodo_tarjeta + 'T12:00:00').toLocaleDateString('es-AR', { month: '2-digit', year: 'numeric' })
                  : '—'
                return (
                  <tr key={mov.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${futuro ? 'opacity-75' : ''}`}>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{mov.fecha}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-700 max-w-xs truncate">{mov.detalle ?? '—'}</p>
                      {mov.cuotas_total > 1 && (() => {
                        // Normaliza datos viejos donde actual/total pudieran estar invertidos
                        const ca = Math.min(mov.cuota_actual, mov.cuotas_total)
                        const ct = Math.max(mov.cuota_actual, mov.cuotas_total)
                        return <p className="text-xs text-slate-400">Cuota {ca}/{ct}</p>
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <IconoCategoria icono={mov.categoria_icono} size={16} />
                        {mov.categoria_nombre ?? '—'}
                      </span>
                    </td>
                    {!futuro && (
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">{periodo}</span>
                      </td>
                    )}
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap text-right ${colorClass}`}>
                      {signo}${fmt(mov.monto_estimado ?? mov.monto)}
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
      )}

      {agregando && (
        <AddMovModal
          cuentaId={cuentaId}
          isTarjeta={isTarjeta ?? false}
          cierreDay={cierreDay ?? null}
          venceDay={venceDay ?? null}
          categorias={categorias as any}
          subcategorias={subcategorias}
          cuentas={cuentas}
          onAdd={handleAdd}
          onClose={() => setAgregando(false)}
        />
      )}
    </div>
  )
}
