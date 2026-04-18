'use client'

import { useState, useMemo } from 'react'
import { CheckCircle, Circle, Pencil, X, Plus, Save, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { NuevoItemModal } from '@/components/nuevo-item-modal'
import { IconoCategoria } from '@/components/icono-categoria'
import { CategoriaSelect } from '@/components/categoria-select'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Mov = {
  id: string; fecha: string; detalle: string | null
  monto: number; monto_estimado: number | null; conciliado: boolean
  categoria_icono: string | null; categoria_nombre: string | null
  cuotas_total: number; cuota_actual: number
}
type Categoria   = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

// ─── Helpers período ──────────────────────────────────────────────────────────
function calcularPeriodo(fechaStr: string, cierreDay: number | null, venceDay: number | null, isTarjeta: boolean): string {
  const d = new Date(fechaStr + 'T12:00:00')
  let mes = d.getMonth(); let anio = d.getFullYear()
  if (isTarjeta && cierreDay && venceDay) {
    const day = d.getDate()
    if (day <= cierreDay) { if (venceDay <= cierreDay) mes += 1 }
    else { if (venceDay > cierreDay) mes += 1; else mes += 2 }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}
function addMeses(fechaStr: string, n: number): string {
  const d = new Date(fechaStr + 'T12:00:00'); d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}
function formatPeriodo(p: string): string {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

// ─── Modal editar movimiento ──────────────────────────────────────────────────
function EditModal({ mov, onSave, onClose }: {
  mov: Mov; onSave: (u: Partial<Mov>) => void; onClose: () => void
}) {
  const [fecha,   setFecha]   = useState(mov.fecha)
  const [detalle, setDetalle] = useState(mov.detalle ?? '')
  const [monto,   setMonto]   = useState(String(mov.monto))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const handleGuardar = async () => {
    if (!monto) { setError('El monto es obligatorio'); return }
    setSaving(true)
    const res = await fetch(`/api/movimientos/${mov.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, detalle: detalle || null, monto: parseFloat(monto) }),
    })
    setSaving(false)
    if (res.ok) { onSave({ fecha, detalle: detalle || null, monto: parseFloat(monto) }); onClose() }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Editar movimiento</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div><label className="block text-xs text-slate-500 mb-1">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputClass} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Detalle</label><input type="text" value={detalle} onChange={e => setDetalle(e.target.value)} className={inputClass} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Monto</label><input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className={`${inputClass} font-mono`} /></div>
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2" style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
            <Save size={13} />{saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal agregar movimiento (con cuotas y preview de período) ───────────────
function AddModal({ cuentaId, periodo: periodoBase, cierreDay, venceDay, categorias: catInicial, subcategorias: subInicial, onAdd, onClose }: {
  cuentaId: string; periodo: string
  cierreDay?: number | null; venceDay?: number | null
  categorias: Categoria[]; subcategorias: Subcategoria[]
  onAdd: (movs: Mov[]) => void; onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [fecha,      setFecha]      = useState(today)
  const [detalle,    setDetalle]    = useState('')
  const [monto,      setMonto]      = useState('')
  const [moneda,     setMoneda]     = useState('ARS')
  const [cotizacion, setCotizacion] = useState('')
  const [conciliado, setConciliado] = useState(false)
  const [cuotas,     setCuotas]     = useState(1)
  const [categorias, setCategorias] = useState(catInicial)
  const [subcats,    setSubcats]    = useState(subInicial)
  const [catId,      setCatId]      = useState(catInicial[0]?.id ?? '')
  const [subcatId,   setSubcatId]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [miniModal,  setMiniModal]  = useState<'categoria' | 'subcategoria' | null>(null)

  const isTarjeta = !!(cierreDay && venceDay)
  const subcatsFiltradas = subcats.filter(s => s.categoria_padre === catId)
  const isUSD = moneda === 'USD'

  const periodoCalculado = useMemo(() => calcularPeriodo(fecha, cierreDay ?? null, venceDay ?? null, isTarjeta), [fecha, cierreDay, venceDay, isTarjeta])
  const previewCuotas = useMemo(() => {
    if (cuotas <= 1) return []
    return Array.from({ length: cuotas }, (_, i) => {
      const f = addMeses(fecha, i)
      return { cuota: i + 1, fecha: f, periodo: calcularPeriodo(f, cierreDay ?? null, venceDay ?? null, isTarjeta) }
    })
  }, [cuotas, fecha, cierreDay, venceDay, isTarjeta])

  const handleAgregar = async () => {
    if (!monto || !fecha) { setError('Fecha y monto son obligatorios'); return }
    setSaving(true)
    const montoNum   = parseFloat(monto)
    const montoCuota = cuotas > 1 ? montoNum / cuotas : montoNum
    const cat        = categorias.find(c => c.id === catId)

    const nuevosMovs = Array.from({ length: cuotas }, (_, i) => {
      const fechaCuota   = addMeses(fecha, i)
      const periodoCuota = calcularPeriodo(fechaCuota, cierreDay ?? null, venceDay ?? null, isTarjeta)
      return {
        id: crypto.randomUUID(), fecha: fechaCuota,
        detalle: detalle ? (cuotas > 1 ? `${detalle} (Cuota ${i + 1})` : detalle) : null,
        monto: montoCuota, moneda, tipo_movimiento: 'Gasto',
        cuenta_origen: cuentaId, categoria: catId || null, subcategoria: subcatId || null,
        cotizacion: isUSD && cotizacion ? parseFloat(cotizacion) : null,
        conciliado, periodo_tarjeta: periodoCuota,
        cuotas_total: cuotas, cuota_actual: i + 1, ciclo_actual: 1,
      }
    })

    const res = await fetch('/api/movimientos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevosMovs),
    })
    setSaving(false)
    if (res.ok) {
      // Solo mostramos en la tabla actual los del período base
      const movsDelPeriodo = nuevosMovs
        .filter(m => m.periodo_tarjeta === periodoBase)
        .map(m => ({
          id: m.id, fecha: m.fecha, detalle: m.detalle, monto: montoCuota,
          monto_estimado: isUSD && cotizacion ? montoCuota * parseFloat(cotizacion) : montoCuota,
          conciliado, categoria_icono: cat?.icono ?? null,
          categoria_nombre: cat?.nombre_categoria ?? null,
          cuotas_total: cuotas, cuota_actual: m.cuota_actual,
        }))
      onAdd(movsDelPeriodo.length > 0 ? movsDelPeriodo : [{
        id: nuevosMovs[0].id, fecha: nuevosMovs[0].fecha, detalle: nuevosMovs[0].detalle,
        monto: montoCuota, monto_estimado: isUSD && cotizacion ? montoCuota * parseFloat(cotizacion) : montoCuota,
        conciliado, categoria_icono: cat?.icono ?? null, categoria_nombre: cat?.nombre_categoria ?? null,
        cuotas_total: cuotas, cuota_actual: 1,
      }])
      onClose()
    } else {
      const d = await res.json(); setError(d.error ?? 'Error')
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white'

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
            <h3 className="text-sm font-semibold text-slate-800">Agregar movimiento al periodo</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Detalle</label><input type="text" value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Ej: Netflix" className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Moneda</label>
                <select value={moneda} onChange={e => setMoneda(e.target.value)} className={inputClass}>
                  <option value="ARS">ARS</option><option value="USD">USD</option>
                </select>
              </div>
              <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Monto total *</label><input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" className={`${inputClass} font-mono`} /></div>
            </div>
            {isUSD && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3 items-center">
                <div className="flex-1"><label className="block text-xs text-amber-700 mb-1">Cotización</label><input type="number" step="0.01" value={cotizacion} onChange={e => setCotizacion(e.target.value)} placeholder="Ej: 1410" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none bg-white" /></div>
                <label className="flex items-center gap-2 cursor-pointer mt-4"><input type="checkbox" checked={conciliado} onChange={e => setConciliado(e.target.checked)} className="w-4 h-4" /><span className="text-xs text-amber-700">Conciliado</span></label>
              </div>
            )}

            {/* Cuotas */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Cuotas</label>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={48} value={cuotas} onChange={e => setCuotas(Math.max(1, parseInt(e.target.value) || 1))} className={`${inputClass} w-24 font-mono`} />
                {cuotas > 1 && monto && <span className="text-xs text-slate-500">= ${fmt(parseFloat(monto) / cuotas)} / cuota</span>}
              </div>
            </div>

            {/* Preview período */}
            {fecha && (
              <div className={`rounded-xl px-4 py-3 text-xs ${cuotas > 1 ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}`}>
                {cuotas <= 1 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Período que impacta</span>
                    <span className="font-semibold text-slate-700">{formatPeriodo(periodoCalculado)}</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-blue-600 font-medium mb-2">{cuotas} cuotas — distribución:</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {previewCuotas.map(({ cuota, periodo }) => (
                        <div key={cuota} className="flex justify-between text-slate-600">
                          <span>Cuota {cuota}/{cuotas}</span>
                          <span className={`font-medium ${periodo === periodoBase ? 'text-blue-600' : ''}`}>{formatPeriodo(periodo)}</span>
                        </div>
                      ))}
                    </div>
                    {cuotas > 1 && <p className="text-blue-500 mt-2 text-[10px]">* Las resaltadas en azul impactan en este período</p>}
                  </div>
                )}
              </div>
            )}

            {/* Categoría con ícono */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Categoría</label>
                <button onClick={() => setMiniModal('categoria')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"><Plus size={11} /> Nueva</button>
              </div>
              <CategoriaSelect categorias={categorias} value={catId} onChange={id => { setCatId(id); setSubcatId('') }} />
            </div>

            {/* Subcategoría */}
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
            <button onClick={handleAgregar} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2" style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
              <Plus size={13} />{saving ? 'Guardando...' : cuotas > 1 ? `Agregar ${cuotas} cuotas` : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
      {miniModal === 'categoria' && (
        <NuevoItemModal tipo="categoria" categorias={categorias}
          onCreado={(id, nombre, icono) => { setCategorias(prev => [...prev, { id, nombre_categoria: nombre, icono: icono ?? null, tipo_default: 'Gasto' }]); setCatId(id) }}
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

// ─── Componente principal ─────────────────────────────────────────────────────
export function ConciliacionControls({ movimientos: inicial, cuentaId, periodo, categorias, subcategorias, cierreDay, venceDay }: {
  movimientos: Mov[]; cuentaId: string; periodo: string
  categorias: Categoria[]; subcategorias: Subcategoria[]
  cierreDay?: number | null; venceDay?: number | null
}) {
  const [movs,      setMovs]     = useState([...inicial])
  const [loading,   setLoading]  = useState<string | null>(null)
  const [bulkLoad,  setBulkLoad] = useState(false)
  const [editando,  setEditando] = useState<Mov | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [sortKey,   setSortKey]  = useState<'fecha' | 'detalle' | 'categoria_nombre' | 'monto'>('fecha')
  const [sortDir,   setSortDir]  = useState<'asc' | 'desc'>('asc')

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }: { col: typeof sortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={10} className="text-slate-300" />
    return sortDir === 'asc'
      ? <ArrowUp size={10} className="text-emerald-500" />
      : <ArrowDown size={10} className="text-emerald-500" />
  }
  const sortMovs = (arr: Mov[]) => [...arr].sort((a, b) => {
    let av: any = sortKey === 'monto' ? (a.monto_estimado ?? a.monto) : (a[sortKey] ?? '')
    let bv: any = sortKey === 'monto' ? (b.monto_estimado ?? b.monto) : (b[sortKey] ?? '')
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
  })

  const noConciliados   = movs.filter(m => !m.conciliado)
  const conciliados     = movs.filter(m => m.conciliado)
  const totalPeriodo    = movs.reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0)
  const totalConciliado = conciliados.reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0)
  const totalPendiente  = noConciliados.reduce((a, m) => a + (m.monto_estimado ?? m.monto), 0)

  const toggle = async (id: string, actual: boolean) => {
    setLoading(id)
    const res = await fetch(`/api/movimientos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conciliado: !actual }) })
    setLoading(null)
    if (res.ok) setMovs(prev => prev.map(m => m.id === id ? { ...m, conciliado: !actual } : m))
  }

  const conciliarTodos = async () => {
    setBulkLoad(true)
    const res = await fetch('/api/conciliar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuentaId, periodo }) })
    setBulkLoad(false)
    if (res.ok) setMovs(prev => prev.map(m => ({ ...m, conciliado: true })))
  }

  const thBase = 'text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-3 font-medium whitespace-nowrap'
  const Th = ({ col, label, right }: { col: typeof sortKey; label: string; right?: boolean }) => (
    <th className={`${thBase} ${right ? 'text-right' : ''}`}>
      <button onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 hover:text-slate-600 transition-colors ${right ? 'ml-auto' : ''}`}>
        {label}<SortIcon col={col} />
      </button>
    </th>
  )

  const MovRow = ({ mov }: { mov: Mov }) => (
    <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <button onClick={() => toggle(mov.id, mov.conciliado)} disabled={loading === mov.id}>
          {loading === mov.id ? <span className="text-slate-300 text-xs">···</span>
            : mov.conciliado ? <CheckCircle size={18} className="text-emerald-500" />
            : <Circle size={18} className="text-slate-300 hover:text-slate-400" />}
        </button>
      </td>
      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{mov.fecha}</td>
      <td className="px-4 py-3">
        <p className={`text-sm font-medium max-w-xs truncate ${mov.conciliado ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{mov.detalle ?? '—'}</p>
        {mov.cuotas_total > 1 && <p className="text-xs text-slate-400">Cuota {mov.cuota_actual}/{mov.cuotas_total}</p>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-sm text-slate-500">
          <IconoCategoria icono={mov.categoria_icono} size={16} />
          {mov.categoria_nombre ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3 font-semibold text-right text-slate-800 whitespace-nowrap">${fmt(mov.monto_estimado ?? mov.monto)}</td>
      <td className="px-4 py-3"><button onClick={() => setEditando(mov)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100"><Pencil size={13} /></button></td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total periodo</p><p className="text-xl font-bold text-slate-800">${fmt(totalPeriodo)}</p><p className="text-xs text-slate-400 mt-1">{movs.length} movimientos</p></div>
        <div className="bg-emerald-50 rounded-xl p-4"><p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Conciliados</p><p className="text-xl font-bold text-emerald-700">${fmt(totalConciliado)}</p><p className="text-xs text-emerald-500 mt-1">{conciliados.length} movimientos</p></div>
        <div className={`rounded-xl p-4 ${noConciliados.length > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}><p className={`text-xs uppercase tracking-wide mb-1 ${noConciliados.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Pendientes</p><p className={`text-xl font-bold ${noConciliados.length > 0 ? 'text-amber-700' : 'text-slate-400'}`}>${fmt(totalPendiente)}</p><p className={`text-xs mt-1 ${noConciliados.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{noConciliados.length} movimientos</p></div>
      </div>
      <div className="flex justify-end">
        <button onClick={() => setAgregando(true)} className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium" style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}><Plus size={15} />Agregar movimiento</button>
      </div>
      {noConciliados.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-50 bg-amber-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Pendientes ({noConciliados.length})</p>
            <button onClick={conciliarTodos} disabled={bulkLoad} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: bulkLoad ? 0.7 : 1 }}>{bulkLoad ? 'Conciliando...' : 'Conciliar todos'}</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-50"><th className="px-4 py-3 w-10" /><Th col="fecha" label="Fecha" /><Th col="detalle" label="Detalle" /><Th col="categoria_nombre" label="Categoría" /><Th col="monto" label="Monto" right /><th className="px-4 py-3" /></tr></thead><tbody>{sortMovs(noConciliados).map(m => <MovRow key={m.id} mov={m} />)}</tbody></table></div>
        </div>
      )}
      {conciliados.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conciliados ({conciliados.length})</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-50"><th className="px-4 py-3 w-10" /><Th col="fecha" label="Fecha" /><Th col="detalle" label="Detalle" /><Th col="categoria_nombre" label="Categoría" /><Th col="monto" label="Monto" right /><th className="px-4 py-3" /></tr></thead><tbody>{sortMovs(conciliados).map(m => <MovRow key={m.id} mov={m} />)}</tbody></table></div>
        </div>
      )}
      {movs.length === 0 && <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm">No hay movimientos para este periodo</div>}
      {editando && <EditModal mov={editando} onSave={u => setMovs(prev => prev.map(m => m.id === editando.id ? { ...m, ...u } : m))} onClose={() => setEditando(null)} />}
      {agregando && <AddModal cuentaId={cuentaId} periodo={periodo} cierreDay={cierreDay} venceDay={venceDay} categorias={categorias} subcategorias={subcategorias} onAdd={nuevos => setMovs(prev => [...prev, ...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha)))} onClose={() => setAgregando(false)} />}
    </div>
  )
}
