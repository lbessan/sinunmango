'use client'

import { useState, useMemo, useRef } from 'react'
import { CheckCircle, Circle, Pencil, X, Plus, Save, ArrowUpDown, ArrowUp, ArrowDown, FileText, Upload, AlertCircle, CheckSquare, Square } from 'lucide-react'
import { NuevoItemModal }  from '@/components/nuevo-item-modal'
import { IconoCategoria }  from '@/components/icono-categoria'
import { CategoriaSelect } from '@/components/categoria-select'
import { calcularPeriodo, addMonths, stripCuotaSuffix } from '@/lib/tarjeta-periodo'
import { todayAR } from '@/lib/timezone'
import { LimitReachedModal, tryParseLimitReached, type LimitReachedInfo } from '@/components/limit-reached-modal'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Mov = {
  id: string; fecha: string; detalle: string | null
  monto: number; monto_estimado: number | null; conciliado: boolean
  moneda: string; cotizacion: number | null
  categoria_icono: string | null; categoria_nombre: string | null
  cuotas_total: number; cuota_actual: number
  tipo_movimiento?: string   // 'Gasto' | 'Ingreso' — Ingreso = descuento/bonificación
  categoria?: string | null; subcategoria?: string | null
  periodo_tarjeta?: string | null
}
type Categoria   = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

// ─── Helpers período ──────────────────────────────────────────────────────────
// calcularPeriodo + addMonths importados de @/lib/tarjeta-periodo
function formatPeriodo(p: string): string {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

// ─── Modal editar movimiento (full) ──────────────────────────────────────────
function EditModal({ mov, categorias, subcategorias, cierreDay, venceDay, onSave, onClose }: {
  mov: Mov
  categorias: Categoria[]; subcategorias: Subcategoria[]
  cierreDay?: number | null; venceDay?: number | null
  onSave: (u: Partial<Mov>) => void; onClose: () => void
}) {
  const ic = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white'

  const [fecha,        setFecha]        = useState(mov.fecha)
  const [detalle,      setDetalle]      = useState(mov.detalle ?? '')
  const [monto,        setMonto]        = useState(String(mov.monto))
  const [moneda,       setMoneda]       = useState(mov.moneda ?? 'ARS')
  const [cotizacion,   setCotizacion]   = useState(String(mov.cotizacion ?? ''))
  const [conciliado,   setConciliado]   = useState(mov.conciliado)
  const [catId,        setCatId]        = useState(mov.categoria ?? '')
  const [subcatId,     setSubcatId]     = useState(mov.subcategoria ?? '')
  const [periodoMes,   setPeriodoMes]   = useState((mov.periodo_tarjeta ?? '').slice(0, 7))
  const [periodoManual,setPeriodoManual]= useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const isUSD        = moneda === 'USD'
  const isTarjeta    = !!(cierreDay && venceDay)
  const subcatsOfCat = subcategorias.filter(s => s.categoria_padre === catId)
  const cat          = categorias.find(c => c.id === catId)

  // Período auto
  const periodoAuto = fecha ? calcularPeriodo(fecha, cierreDay ?? null, venceDay ?? null, isTarjeta).slice(0, 7) : ''
  const periodoEfectivo = periodoManual ? periodoMes : periodoAuto
  const periodoLabel = periodoEfectivo
    ? new Date(periodoEfectivo + '-01T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : null

  const montoArs = isUSD && monto && cotizacion
    ? parseFloat(monto) * parseFloat(cotizacion)
    : null

  const handleGuardar = async () => {
    if (!monto) { setError('El monto es obligatorio'); return }
    setSaving(true)
    const periodo = (periodoEfectivo || periodoAuto) + '-01'
    const body: any = {
      fecha,
      detalle:         detalle || null,
      monto:           parseFloat(monto),
      moneda,
      cotizacion:      isUSD && cotizacion ? parseFloat(cotizacion) : null,
      conciliado,
      categoria:       catId   || null,
      subcategoria:    subcatId || null,
      tipo_movimiento: cat?.tipo_default ?? mov.tipo_movimiento,
      periodo_tarjeta: periodo,
    }
    const res = await fetch(`/api/movimientos/${mov.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      const montoEst = isUSD && cotizacion ? parseFloat(monto) * parseFloat(cotizacion) : parseFloat(monto)
      onSave({
        fecha, detalle: detalle || null,
        monto: parseFloat(monto),
        moneda,
        cotizacion: isUSD && cotizacion ? parseFloat(cotizacion) : mov.cotizacion,
        monto_estimado: montoEst,
        conciliado,
        categoria:    catId   || null,
        subcategoria: subcatId || null,
        categoria_nombre: cat?.nombre_categoria ?? mov.categoria_nombre,
        categoria_icono:  cat?.icono          ?? mov.categoria_icono,
        periodo_tarjeta:  periodo,
        tipo_movimiento:  cat?.tipo_default ?? mov.tipo_movimiento,
      })
      onClose()
    } else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-semibold text-slate-800">Editar movimiento</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Fecha + Detalle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Detalle</label>
              <input type="text" value={detalle} onChange={e => setDetalle(e.target.value)} className={ic} />
            </div>
          </div>

          {/* Moneda + Monto */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Moneda</label>
              <select value={moneda} onChange={e => setMoneda(e.target.value)} className={ic}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Monto {isUSD ? '(U$S)' : '($)'}</label>
              <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className={`${ic} font-mono`} />
            </div>
          </div>

          {/* USD cotización + conciliado */}
          {isUSD && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
              <label className="block text-xs font-medium text-blue-700">Tipo de cambio ($ por U$S)</label>
              <div className="flex gap-3 items-center">
                <input type="number" step="0.01" value={cotizacion} onChange={e => setCotizacion(e.target.value)}
                  placeholder="Ej: 1420" className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm outline-none bg-white font-mono" />
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-blue-700 shrink-0">
                  <input type="checkbox" checked={conciliado} onChange={e => setConciliado(e.target.checked)} className="w-3.5 h-3.5" />
                  Conciliado
                </label>
              </div>
              {montoArs !== null && <p className="text-xs text-blue-600 font-medium">= ${fmt(montoArs)} ARS</p>}
              {!cotizacion && <p className="text-xs text-blue-400">Sin tipo de cambio — solo en U$S</p>}
            </div>
          )}

          {/* Categoría */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Categoría</label>
            <CategoriaSelect
              categorias={categorias}
              value={catId}
              onChange={id => { setCatId(id); setSubcatId('') }}
            />
          </div>

          {/* Subcategoría */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Subcategoría</label>
            <select value={subcatId} onChange={e => setSubcatId(e.target.value)} className={ic} disabled={subcatsOfCat.length === 0}>
              <option value="">{subcatsOfCat.length === 0 ? '(sin subcats)' : '— elegir —'}</option>
              {subcatsOfCat.map(s => <option key={s.id} value={s.id}>{s.nombre_subcategoria}</option>)}
            </select>
          </div>

          {/* Período de imputación */}
          <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Período de imputación</span>
              {!periodoManual && periodoLabel && (
                <span className="text-slate-400">
                  Auto: <span className="font-semibold text-slate-600">{periodoLabel}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={periodoManual ? periodoMes : periodoAuto}
                onChange={e => { setPeriodoMes(e.target.value); setPeriodoManual(true) }}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
              />
              {periodoManual && (
                <button onClick={() => setPeriodoManual(false)} className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap">
                  Restaurar auto
                </button>
              )}
            </div>
            {periodoManual && (
              <p className="text-xs text-amber-600">⚠ Período sobreescrito manualmente</p>
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-70"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
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
  const today = todayAR()
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
      const f = addMonths(fecha, i)
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
      const fechaCuota   = addMonths(fecha, i)
      const periodoCuota = calcularPeriodo(fechaCuota, cierreDay ?? null, venceDay ?? null, isTarjeta)
      return {
        id: crypto.randomUUID(), fecha: fechaCuota,
        // Sufijo "(Cuota N/T)" con total. Si no hay detalle, generamos uno mínimo.
        detalle: cuotas > 1
          ? (detalle ? `${detalle} (Cuota ${i + 1}/${cuotas})` : `Cuota ${i + 1}/${cuotas}`)
          : (detalle || null),
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
      const cotizNum = isUSD && cotizacion ? parseFloat(cotizacion) : null
      const movsDelPeriodo = nuevosMovs
        .filter(m => m.periodo_tarjeta === periodoBase)
        .map(m => ({
          id: m.id, fecha: m.fecha, detalle: m.detalle, monto: montoCuota,
          monto_estimado: cotizNum ? montoCuota * cotizNum : montoCuota,
          moneda, cotizacion: cotizNum,
          conciliado, tipo_movimiento: 'Gasto',
          categoria_icono: cat?.icono ?? null,
          categoria_nombre: cat?.nombre_categoria ?? null,
          cuotas_total: cuotas, cuota_actual: m.cuota_actual,
        }))
      onAdd(movsDelPeriodo.length > 0 ? movsDelPeriodo : [{
        id: nuevosMovs[0].id, fecha: nuevosMovs[0].fecha, detalle: nuevosMovs[0].detalle,
        monto: montoCuota, monto_estimado: cotizNum ? montoCuota * cotizNum : montoCuota,
        moneda, cotizacion: cotizNum,
        conciliado, tipo_movimiento: 'Gasto',
        categoria_icono: cat?.icono ?? null, categoria_nombre: cat?.nombre_categoria ?? null,
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

// ─── Modal importar PDF ───────────────────────────────────────────────────────
type Transaccion = {
  fecha: string; detalle: string; monto_ars: number | null; monto_usd: number | null
  cuotas: number; cuotas_total: number; ya_existe: boolean; seleccionada: boolean
  es_impuesto: boolean; es_descuento: boolean; catId: string
  subcatId: string  // opcional, vacío si la categoría no tiene subcategorías
}

// Selector de categoría compacto, inline (sin label exterior)
function CatSelect({ categorias, value, onChange }: { categorias: Categoria[]; value: string; onChange: (id: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => { e.stopPropagation(); onChange(e.target.value) }}
      onClick={e => e.stopPropagation()}
      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 outline-none focus:ring-1 focus:ring-blue-200 mt-1.5"
    >
      <option value="">— sin categoría —</option>
      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre_categoria}</option>)}
    </select>
  )
}

// Selector de subcategoría — solo se renderiza si la cat elegida tiene subcategorías
function SubCatSelect({ subcategorias, value, onChange }: { subcategorias: Subcategoria[]; value: string; onChange: (id: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => { e.stopPropagation(); onChange(e.target.value) }}
      onClick={e => e.stopPropagation()}
      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-500 outline-none focus:ring-1 focus:ring-blue-200"
    >
      <option value="">— sin subcategoría —</option>
      {subcategorias.map(sc => <option key={sc.id} value={sc.id}>{sc.nombre_subcategoria}</option>)}
    </select>
  )
}

function ImportarPdfModal({ cuentaId, periodo, cierreDay, venceDay, movimientosExistentes, categorias, subcategorias, onImported, onClose }: {
  cuentaId: string; periodo: string
  cierreDay?: number | null; venceDay?: number | null
  movimientosExistentes: Mov[]
  categorias: Categoria[]; subcategorias: Subcategoria[]
  onImported: (movs: Mov[]) => void; onClose: () => void
}) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const [step,    setStep]   = useState<'upload' | 'review'>('upload')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [txs,     setTxs]     = useState<Transaccion[]>([])
  const [saving,  setSaving]  = useState(false)
  const [limitInfo, setLimitInfo] = useState<LimitReachedInfo | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)  // fila con detalle en edición inline

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Solo se aceptan archivos PDF'); return }
    setLoading(true); setError('')

    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      const movsExist = movimientosExistentes.map(m => ({
        detalle: m.detalle, monto: m.monto_estimado ?? m.monto, fecha: m.fecha,
      }))
      const res = await fetch('/api/parsear-resumen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: base64, movimientosExistentes: movsExist }),
      })
      setLoading(false)
      const limitReached = await tryParseLimitReached(res)
      if (limitReached) {
        setLimitInfo(limitReached)
        window.dispatchEvent(new Event('usage:changed'))
        return
      }
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al procesar el PDF'); return }
      window.dispatchEvent(new Event('usage:changed'))
      const d = await res.json()
      const parsed: Transaccion[] = (d.transacciones ?? []).map((t: any) => ({
        ...t,
        es_descuento: t.es_descuento ?? false,
        seleccionada: !t.ya_existe,
        catId: '',
        subcatId: '',
      }))
      setTxs(parsed)
      setStep('review')
    }
    reader.readAsDataURL(file)
  }

  const toggleTx = (i: number) =>
    setTxs(prev => prev.map((t, idx) => idx === i ? { ...t, seleccionada: !t.seleccionada } : t))

  // Cambiar categoría resetea la subcategoría (subcat queda colgada sino).
  const setCatForTx = (i: number, catId: string) =>
    setTxs(prev => prev.map((t, idx) => idx === i ? { ...t, catId, subcatId: '' } : t))

  const setSubcatForTx = (i: number, subcatId: string) =>
    setTxs(prev => prev.map((t, idx) => idx === i ? { ...t, subcatId } : t))

  const setDetalleForTx = (i: number, detalle: string) =>
    setTxs(prev => prev.map((t, idx) => idx === i ? { ...t, detalle } : t))

  const toggleAll = () => {
    const allSel = txs.filter(t => !t.ya_existe).every(t => t.seleccionada)
    setTxs(prev => prev.map(t => t.ya_existe ? t : { ...t, seleccionada: !allSel }))
  }

  const handleImportar = async () => {
    const seleccionadas = txs.filter(t => t.seleccionada)
    if (!seleccionadas.length) { setError('Seleccioná al menos una transacción'); return }
    setSaving(true); setError('')

    const isTarjeta = !!(cierreDay && venceDay)

    const nuevosMovs = seleccionadas.flatMap(tx => {
      // El monto del PDF (línea "C.XX/YY ... $X") es el valor de UNA cuota,
      // no el total de la compra. Cada cuota hermana se carga con ese mismo monto.
      const montoCuota = tx.monto_usd ?? Math.abs(tx.monto_ars ?? 0)
      const tipoMov   = tx.es_descuento ? 'Ingreso' : 'Gasto'
      // Si la transacción tiene cuotas, generamos un grupo_cuotas común para
      // linkear las N cuotas hermanas (compra única partida en cuotas).
      const grupo = tx.cuotas_total > 1 ? crypto.randomUUID() : null
      return Array.from({ length: tx.cuotas_total }, (_, i) => {
        const fechaCuota   = addMonths(tx.fecha, i)
        const periodoCuota = calcularPeriodo(fechaCuota, cierreDay ?? null, venceDay ?? null, isTarjeta)
        return {
          id: crypto.randomUUID(), fecha: fechaCuota,
          detalle: tx.cuotas_total > 1 ? `${tx.detalle} (Cuota ${i + 1}/${tx.cuotas_total})` : tx.detalle,
          monto: montoCuota,
          moneda: tx.monto_usd ? 'USD' : 'ARS',
          tipo_movimiento: tipoMov,
          cuenta_origen: cuentaId, categoria: tx.catId || null, subcategoria: tx.subcatId || null,
          cotizacion: null, conciliado: true,
          periodo_tarjeta: periodoCuota,
          cuotas_total: tx.cuotas_total, cuota_actual: i + 1, ciclo_actual: 1,
          grupo_cuotas: grupo,
        }
      })
    })

    const res = await fetch('/api/movimientos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevosMovs),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error'); return }

    // Devolver solo los que caen en el período actual
    const movsDelPeriodo = seleccionadas
      .filter(tx => calcularPeriodo(tx.fecha, cierreDay ?? null, venceDay ?? null, isTarjeta) === periodo)
      .map(tx => {
        const cat = categorias.find(c => c.id === tx.catId)
        const isUsdTx = !!tx.monto_usd
        const montoAbs = Math.abs(tx.monto_ars ?? tx.monto_usd ?? 0)
        const montoFinal = isUsdTx ? (tx.monto_usd ?? montoAbs) : montoAbs
        return {
          id: crypto.randomUUID(), fecha: tx.fecha,
          detalle: tx.detalle,
          monto: montoFinal,
          monto_estimado: isUsdTx ? montoAbs : montoAbs,
          moneda: isUsdTx ? 'USD' : 'ARS',
          cotizacion: null,
          conciliado: true,
          tipo_movimiento: tx.es_descuento ? 'Ingreso' : 'Gasto',
          categoria_icono: cat?.icono ?? null,
          categoria_nombre: cat?.nombre_categoria ?? null,
          cuotas_total: tx.cuotas_total, cuota_actual: tx.cuotas,
        }
      })

    onImported(movsDelPeriodo)
    onClose()
  }

  const nuevas    = txs.filter(t => !t.ya_existe)
  const existente = txs.filter(t => t.ya_existe)
  const selCount  = txs.filter(t => t.seleccionada).length

  // Agrupar nuevas: consumos, descuentos, impuestos
  const nuevasConsumos   = txs.map((t, i) => ({ t, i })).filter(({ t }) => !t.ya_existe && !t.es_impuesto && !t.es_descuento)
  const nuevasDescuentos = txs.map((t, i) => ({ t, i })).filter(({ t }) => !t.ya_existe && t.es_descuento)
  const nuevasImpuestos  = txs.map((t, i) => ({ t, i })).filter(({ t }) => !t.ya_existe && t.es_impuesto)

  const categoriasGasto   = categorias.filter(c => c.tipo_default !== 'Ingreso')
  const categoriasIngreso = categorias.filter(c => c.tipo_default === 'Ingreso')

  const TxRow = ({ tx, idx }: { tx: Transaccion; idx: number }) => {
    const montoArs = tx.monto_ars
    const montoUsd = tx.monto_usd
    const esDescuento = tx.es_descuento
    // El API ahora devuelve montos siempre positivos; es_descuento indica crédito a favor
    const montoLabel = montoArs !== null
      ? `${esDescuento ? '+' : ''}$${Math.abs(montoArs).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
      : `${esDescuento ? '+' : ''}U$S ${Math.abs(montoUsd ?? 0).toFixed(2)}`
    const selBg = esDescuento ? 'bg-emerald-50' : 'bg-blue-50'
    // Subcategorías de la categoría elegida (vacío si la cat no tiene)
    const subsDeCat = tx.catId ? subcategorias.filter(sc => sc.categoria_padre === tx.catId) : []
    const isEditing = editingIdx === idx
    return (
      <div className={`px-4 py-3 border-b border-slate-50 last:border-0 transition-colors ${tx.seleccionada ? selBg : 'hover:bg-slate-50'}`}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => toggleTx(idx)}
            className="mt-0.5 shrink-0"
            aria-label={tx.seleccionada ? 'Deseleccionar' : 'Seleccionar'}
          >
            {tx.seleccionada
              ? <CheckSquare size={17} className={esDescuento ? 'text-emerald-500' : 'text-blue-500'} />
              : <Square size={17} className="text-slate-300" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {isEditing ? (
                <input
                  type="text"
                  value={tx.detalle}
                  autoFocus
                  onChange={e => setDetalleForTx(idx, e.target.value)}
                  onBlur={() => setEditingIdx(null)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingIdx(null) }}
                  className="flex-1 text-sm font-medium text-slate-700 bg-white border border-blue-200 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-300"
                />
              ) : (
                <p
                  className="text-sm font-medium text-slate-700 truncate cursor-text hover:bg-slate-100 rounded px-1 -mx-1"
                  onClick={() => setEditingIdx(idx)}
                  title="Click para editar"
                >
                  {tx.detalle}
                </p>
              )}
              {esDescuento && <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full shrink-0">DESCUENTO</span>}
            </div>
            <p className="text-xs text-slate-400">
              {tx.fecha}{tx.cuotas_total > 1 ? ` · Cuota ${tx.cuotas}/${tx.cuotas_total}` : ''}
            </p>
          </div>
          <span className={`text-sm font-semibold whitespace-nowrap mt-0.5 ${esDescuento ? 'text-emerald-600' : 'text-slate-700'}`}>{montoLabel}</span>
        </div>
        {tx.seleccionada && (
          <div className="ml-8 space-y-1.5">
            <CatSelect
              categorias={tx.es_descuento ? categoriasIngreso : categoriasGasto}
              value={tx.catId}
              onChange={id => setCatForTx(idx, id)}
            />
            {subsDeCat.length > 0 && (
              <SubCatSelect
                subcategorias={subsDeCat}
                value={tx.subcatId}
                onChange={id => setSubcatForTx(idx, id)}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Importar resumen PDF</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4">
            {loading ? (
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-slate-500">Analizando el resumen con IA...</p>
                <p className="text-xs text-slate-400 mt-1">Puede tardar unos segundos</p>
              </div>
            ) : (
              <>
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  className="w-full border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors hover:bg-blue-50"
                >
                  <Upload size={32} className="text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">Arrastrá el PDF o hacé click</p>
                  <p className="text-xs text-slate-400">Resúmenes de BBVA, Santander, HSBC, Galicia, etc.</p>
                  <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg w-full">
                    <AlertCircle size={15} />{error}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Consumos nuevos */}
              {nuevasConsumos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Consumos nuevos ({nuevasConsumos.length})
                    </p>
                    <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700">
                      {nuevasConsumos.every(({ t }) => t.seleccionada) ? <CheckSquare size={13} /> : <Square size={13} />}
                      {nuevasConsumos.every(({ t }) => t.seleccionada) ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {nuevasConsumos.map(({ t, i }) => <TxRow key={i} tx={t} idx={i} />)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                    Al seleccionar cada fila podés asignarle una categoría
                  </p>
                </div>
              )}

              {/* Descuentos / bonificaciones */}
              {nuevasDescuentos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">
                    Descuentos y bonificaciones ({nuevasDescuentos.length})
                  </p>
                  <div className="bg-white border border-emerald-100 rounded-xl overflow-hidden">
                    {nuevasDescuentos.map(({ t, i }) => <TxRow key={i} tx={t} idx={i} />)}
                  </div>
                </div>
              )}

              {/* Impuestos / cargos — individuales */}
              {nuevasImpuestos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Impuestos y cargos ({nuevasImpuestos.length}) · Total ${nuevasImpuestos.reduce((s, { t }) => s + (t.monto_ars ?? 0), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-white border border-amber-100 rounded-xl overflow-hidden">
                    {nuevasImpuestos.map(({ t, i }) => <TxRow key={i} tx={t} idx={i} />)}
                  </div>
                </div>
              )}

              {/* Ya existen */}
              {existente.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Ya cargadas ({existente.length}) — no se duplicarán
                  </p>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {txs.map((tx, i) => {
                      if (!tx.ya_existe) return null
                      const monto = tx.monto_ars
                        ? `$${tx.monto_ars.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                        : `U$S ${tx.monto_usd?.toFixed(2)}`
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 opacity-50">
                          <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-500 truncate">{tx.detalle}</p>
                            <p className="text-xs text-slate-400">{tx.fecha}</p>
                          </div>
                          <span className="text-sm text-slate-400 whitespace-nowrap">{monto}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {txs.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No se encontraron transacciones en el PDF
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">
                  <AlertCircle size={15} />{error}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setStep('upload'); setTxs([]) }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
                ← Cambiar PDF
              </button>
              <button onClick={handleImportar} disabled={saving || selCount === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
                {saving ? 'Importando...' : `Importar ${selCount} transacción${selCount !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>

      <LimitReachedModal info={limitInfo} onClose={() => setLimitInfo(null)} />
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ConciliacionControls({ movimientos: inicial, cuentaId, periodo, categorias, subcategorias, cierreDay, venceDay }: {
  movimientos: Mov[]; cuentaId: string; periodo: string
  categorias: Categoria[]; subcategorias: Subcategoria[]
  cierreDay?: number | null; venceDay?: number | null
}) {
  const [movs,        setMovs]       = useState([...inicial])
  const [loading,     setLoading]    = useState<string | null>(null)
  const [bulkLoad,    setBulkLoad]   = useState(false)
  const [editando,    setEditando]   = useState<Mov | null>(null)
  const [agregando,   setAgregando]  = useState(false)
  const [importPdf,   setImportPdf]  = useState(false)
  const [sortKey,     setSortKey]    = useState<'fecha' | 'detalle' | 'categoria_nombre' | 'monto'>('fecha')
  const [sortDir,     setSortDir]    = useState<'asc' | 'desc'>('asc')
  // USD bulk cotización
  const [usdRate,     setUsdRate]    = useState('')
  const [usdSaving,   setUsdSaving]  = useState(false)

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

  // Separar ARS y USD
  const movsARS = movs.filter(m => m.moneda !== 'USD')
  const movsUSD = movs.filter(m => m.moneda === 'USD')

  const noConciliadosARS = movsARS.filter(m => !m.conciliado)
  const conciliadosARS   = movsARS.filter(m => m.conciliado)
  const noConciliadosUSD = movsUSD.filter(m => !m.conciliado)
  const conciliadosUSD   = movsUSD.filter(m => m.conciliado)
  // kept for legacy references (e.g. conciliarTodos)
  const noConciliados    = movs.filter(m => !m.conciliado)
  const conciliados      = movs.filter(m => m.conciliado)

  // USD info
  const totalUSD       = movsUSD.reduce((a, m) => a + m.monto, 0)
  const hasUSD         = movsUSD.length > 0
  const usdSinCotiz    = movsUSD.filter(m => !m.cotizacion).length
  const currentAvgRate = movsUSD.length > 0 && movsUSD.every(m => m.cotizacion)
    ? movsUSD.reduce((a, m) => a + m.cotizacion!, 0) / movsUSD.length
    : null

  const aplicarCotizacionUSD = async () => {
    if (!usdRate) return
    const rate = parseFloat(usdRate)
    if (isNaN(rate) || rate <= 0) return
    setUsdSaving(true)
    await Promise.all(
      movsUSD.map(m =>
        fetch(`/api/movimientos/${m.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cotizacion: rate }),
        })
      )
    )
    setUsdSaving(false)
    setUsdRate('')
    setMovs(prev => prev.map(m =>
      m.moneda === 'USD' ? { ...m, cotizacion: rate, monto_estimado: m.monto * rate } : m
    ))
  }

  // Monto firmado: Gastos suman, Ingresos (descuentos) restan
  const signedARS = (m: Mov) => {
    const base = m.monto_estimado ?? m.monto
    return m.tipo_movimiento === 'Ingreso' ? -base : base
  }

  // Totales ARS netos (gastos − descuentos)
  const totalPeriodoPesos    = movsARS.reduce((a, m) => a + signedARS(m), 0)
  const totalConciliadoPesos = conciliadosARS.reduce((a, m) => a + signedARS(m), 0)
  const totalPendientePesos  = noConciliadosARS.reduce((a, m) => a + signedARS(m), 0)
  // Totales USD (en dólares)
  const totalUSDPeriodo    = movsUSD.reduce((a, m) => a + m.monto, 0)
  const totalUSDConciliado = conciliadosUSD.reduce((a, m) => a + m.monto, 0)
  const totalUSDPendiente  = noConciliadosUSD.reduce((a, m) => a + m.monto, 0)
  // helper para convertir USD a pesos (panel informativo)
  const usdEnPesos = (arr: Mov[]) => arr.reduce((a, m) => a + (m.cotizacion ? m.monto * m.cotizacion : 0), 0)

  const toggle = async (id: string, actual: boolean) => {
    setLoading(id)
    const res = await fetch(`/api/movimientos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conciliado: !actual }) })
    setLoading(null)
    if (res.ok) setMovs(prev => prev.map(m => m.id === id ? { ...m, conciliado: !actual } : m))
  }

  // Conciliar todos los pendientes (ARS + USD)
  const conciliarTodos = async () => {
    setBulkLoad(true)
    await Promise.all(noConciliados.map(m =>
      fetch(`/api/movimientos/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conciliado: true }) })
    ))
    setBulkLoad(false)
    setMovs(prev => prev.map(m => ({ ...m, conciliado: true })))
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

  // ─── MovCard: card mobile que muestra los mismos datos que MovRow pero
  //     en layout vertical para que entren en 360px sin scroll horizontal.
  //     Toda la card es clickeable para editar; el círculo izquierdo
  //     mantiene el toggle de conciliar/desconciliar como en desktop.
  const MovCard = ({ mov }: { mov: Mov }) => {
    const isUSD       = mov.moneda === 'USD'
    const esDescuento = mov.tipo_movimiento === 'Ingreso'
    return (
      <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${esDescuento ? 'bg-emerald-50/30' : ''}`}>
        <button
          onClick={() => toggle(mov.id, mov.conciliado)}
          disabled={loading === mov.id}
          className="shrink-0 mt-0.5 p-1 -m-1"
          aria-label={mov.conciliado ? 'Desconciliar' : 'Conciliar'}
        >
          {loading === mov.id
            ? <span className="text-slate-300 text-xs">···</span>
            : mov.conciliado
              ? <CheckCircle size={20} className="text-emerald-500" />
              : <Circle size={20} className="text-slate-300" />
          }
        </button>
        <button
          onClick={() => setEditando(mov)}
          className="min-w-0 flex-1 text-left active:bg-slate-100 -mx-2 px-2 py-0.5 rounded"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`text-sm font-medium break-words ${mov.conciliado ? 'text-slate-400 line-through' : esDescuento ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {stripCuotaSuffix(mov.detalle) || '—'}
                </p>
                {esDescuento && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full">DESCUENTO</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              {isUSD ? (
                <>
                  <p className={`text-sm font-semibold tabular-nums whitespace-nowrap ${esDescuento ? 'text-emerald-600' : 'text-blue-700'}`}>
                    {esDescuento ? '−' : ''}U$S {fmt(mov.monto)}
                  </p>
                  {mov.cotizacion
                    ? <p className="text-[11px] text-slate-400 tabular-nums">≈ ${fmt(mov.monto * mov.cotizacion)}</p>
                    : <p className="text-[11px] text-amber-500">sin cotización</p>
                  }
                </>
              ) : (
                <p className={`text-sm font-semibold tabular-nums whitespace-nowrap ${esDescuento ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {esDescuento ? '−' : ''}${fmt(mov.monto_estimado ?? mov.monto)}
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 truncate">
            <IconoCategoria icono={mov.categoria_icono} size={14} />
            {mov.categoria_nombre ?? '—'}
          </p>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-400">
            <span className="tabular-nums">{mov.fecha}</span>
            {mov.cuotas_total > 1 && <span>· Cuota {mov.cuota_actual}/{mov.cuotas_total}</span>}
          </div>
        </button>
      </div>
    )
  }

  const MovRow = ({ mov }: { mov: Mov }) => {
    const isUSD       = mov.moneda === 'USD'
    const esDescuento = mov.tipo_movimiento === 'Ingreso'
    return (
      <tr className={`border-b border-slate-50 transition-colors ${esDescuento ? 'hover:bg-emerald-50 bg-emerald-50/30' : 'hover:bg-slate-50'}`}>
        <td className="px-4 py-3">
          <button onClick={() => toggle(mov.id, mov.conciliado)} disabled={loading === mov.id}>
            {loading === mov.id ? <span className="text-slate-300 text-xs">···</span>
              : mov.conciliado ? <CheckCircle size={18} className="text-emerald-500" />
              : <Circle size={18} className="text-slate-300 hover:text-slate-400" />}
          </button>
        </td>
        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{mov.fecha}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium max-w-xs truncate ${mov.conciliado ? 'text-slate-400 line-through' : esDescuento ? 'text-emerald-700' : 'text-slate-700'}`}>
              {stripCuotaSuffix(mov.detalle) || '—'}
            </p>
            {esDescuento && (
              <span className="shrink-0 text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full">
                DESCUENTO
              </span>
            )}
          </div>
          {mov.cuotas_total > 1 && <p className="text-xs text-slate-400">Cuota {mov.cuota_actual}/{mov.cuotas_total}</p>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <IconoCategoria icono={mov.categoria_icono} size={16} />
            {mov.categoria_nombre ?? '—'}
          </span>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {isUSD ? (
            <div>
              <p className={`text-sm font-semibold ${esDescuento ? 'text-emerald-600' : 'text-blue-700'}`}>
                {esDescuento ? '−' : ''}U$S {fmt(mov.monto)}
              </p>
              {mov.cotizacion
                ? <p className="text-xs text-slate-400">≈ ${fmt(mov.monto * mov.cotizacion)}</p>
                : <p className="text-xs text-amber-500">sin cotización</p>}
            </div>
          ) : (
            <p className={`text-sm font-semibold ${esDescuento ? 'text-emerald-600' : 'text-slate-800'}`}>
              {esDescuento ? '−' : ''}${fmt(mov.monto_estimado ?? mov.monto)}
            </p>
          )}
        </td>
        <td className="px-4 py-3"><button onClick={() => setEditando(mov)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100"><Pencil size={13} /></button></td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Tarjetas ARS ──
          grid-cols-3 fijo desbordaba con montos AR de 8 dígitos en mobile
          (cada card ~110px). Colapsa a 1 columna debajo de sm. tabular-nums
          alinea dígitos. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total periodo</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">${fmt(totalPeriodoPesos)}</p>
          <p className="text-xs text-slate-400 mt-1">{movsARS.length} movimientos</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4">
          <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Conciliados</p>
          <p className="text-xl font-bold text-emerald-700 tabular-nums">${fmt(totalConciliadoPesos)}</p>
          <p className="text-xs text-emerald-500 mt-1">{conciliadosARS.length} movimientos</p>
        </div>
        <div className={`rounded-xl p-4 ${noConciliadosARS.length > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <p className={`text-xs uppercase tracking-wide mb-1 ${noConciliadosARS.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Pendientes</p>
          <p className={`text-xl font-bold tabular-nums ${noConciliadosARS.length > 0 ? 'text-amber-700' : 'text-slate-400'}`}>${fmt(totalPendientePesos)}</p>
          <p className={`text-xs mt-1 ${noConciliadosARS.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{noConciliadosARS.length} movimientos</p>
        </div>
      </div>

      {/* ── Tarjetas USD (solo si hay movimientos en dólares) ── */}
      {hasUSD && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-xs text-blue-500 uppercase tracking-wide mb-1">Total U$S periodo</p>
            <p className="text-xl font-bold text-blue-800 tabular-nums">U$S {fmt(totalUSDPeriodo)}</p>
            <p className="text-xs text-blue-400 mt-1">{movsUSD.length} movimientos</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Conciliados U$S</p>
            <p className="text-xl font-bold text-emerald-700 tabular-nums">U$S {fmt(totalUSDConciliado)}</p>
            <p className="text-xs text-emerald-500 mt-1">{conciliadosUSD.length} movimientos</p>
          </div>
          <div className={`rounded-xl p-4 border ${noConciliadosUSD.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
            <p className={`text-xs uppercase tracking-wide mb-1 ${noConciliadosUSD.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Pendientes U$S</p>
            <p className={`text-xl font-bold tabular-nums ${noConciliadosUSD.length > 0 ? 'text-amber-700' : 'text-slate-400'}`}>U$S {fmt(totalUSDPendiente)}</p>
            <p className={`text-xs mt-1 ${noConciliadosUSD.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{noConciliadosUSD.length} movimientos</p>
          </div>
        </div>
      )}

      {/* Panel USD */}
      {hasUSD && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
                Gastos en dólares · {movsUSD.length} movimiento{movsUSD.length !== 1 ? 's' : ''}
              </p>
              <p className="text-2xl font-bold text-blue-800">U$S {fmt(totalUSD)}</p>
              {currentAvgRate && (
                <p className="text-xs text-blue-500 mt-0.5">
                  Cotización actual: ${fmt(currentAvgRate)} por U$S
                  → Total estimado ${fmt(totalUSD * currentAvgRate)}
                </p>
              )}
              {usdSinCotiz > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">
                  ⚠ {usdSinCotiz} movimiento{usdSinCotiz !== 1 ? 's' : ''} sin cotización asignada
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div>
                <p className="text-xs text-blue-600 mb-1 font-medium">
                  {currentAvgRate ? 'Actualizar tipo de cambio real' : 'Ingresar tipo de cambio'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" value={usdRate}
                    onChange={e => setUsdRate(e.target.value)}
                    placeholder={currentAvgRate ? fmt(currentAvgRate) : 'Ej: 1250'}
                    className="w-36 px-3 py-2 border border-blue-200 rounded-lg text-sm font-mono bg-white outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    onClick={aplicarCotizacionUSD}
                    disabled={usdSaving || !usdRate}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap"
                    style={{ background: 'linear-gradient(90deg, #1e40af, #1d4ed8)' }}
                  >
                    {usdSaving ? 'Aplicando...' : 'Aplicar a todos'}
                  </button>
                </div>
                {usdRate && !isNaN(parseFloat(usdRate)) && (
                  <p className="text-xs text-blue-600 mt-1">
                    U$S {fmt(totalUSD)} × ${parseFloat(usdRate).toLocaleString('es-AR')} = <strong>${fmt(totalUSD * parseFloat(usdRate))}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={() => setImportPdf(true)} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium border border-slate-200 text-slate-600 hover:bg-white transition-colors"><FileText size={15} />Importar PDF</button>
        <button onClick={() => setAgregando(true)} className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium" style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}><Plus size={15} />Agregar movimiento</button>
      </div>

      {/* ── Pendientes (ARS + USD juntos) ────────────────────────
          Mobile: card-list que muestra detalle + categoría + fecha + monto.
          Desktop (sm+): tabla original. */}
      {noConciliados.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-amber-50 bg-amber-50 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Pendientes ({noConciliados.length})</p>
            <button onClick={conciliarTodos} disabled={bulkLoad} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white whitespace-nowrap" style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: bulkLoad ? 0.7 : 1 }}>{bulkLoad ? 'Conciliando...' : 'Conciliar todos'}</button>
          </div>
          <div className="sm:hidden divide-y divide-slate-50">
            {sortMovs(noConciliados).map(m => <MovCard key={m.id} mov={m} />)}
          </div>
          <div className="hidden sm:block overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-50"><th className="px-4 py-3 w-10" /><Th col="fecha" label="Fecha" /><Th col="detalle" label="Detalle" /><Th col="categoria_nombre" label="Categoría" /><Th col="monto" label="Monto" right /><th className="px-4 py-3" /></tr></thead><tbody>{sortMovs(noConciliados).map(m => <MovRow key={m.id} mov={m} />)}</tbody></table></div>
        </div>
      )}

      {/* ── Conciliados (ARS + USD juntos) ─────────────────────── */}
      {conciliados.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50"><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conciliados ({conciliados.length})</p></div>
          <div className="sm:hidden divide-y divide-slate-50">
            {sortMovs(conciliados).map(m => <MovCard key={m.id} mov={m} />)}
          </div>
          <div className="hidden sm:block overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-50"><th className="px-4 py-3 w-10" /><Th col="fecha" label="Fecha" /><Th col="detalle" label="Detalle" /><Th col="categoria_nombre" label="Categoría" /><Th col="monto" label="Monto" right /><th className="px-4 py-3" /></tr></thead><tbody>{sortMovs(conciliados).map(m => <MovRow key={m.id} mov={m} />)}</tbody></table></div>
        </div>
      )}

      {movs.length === 0 && <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm">No hay movimientos para este periodo</div>}
      {editando && (
        <EditModal
          mov={editando}
          categorias={categorias}
          subcategorias={subcategorias}
          cierreDay={cierreDay}
          venceDay={venceDay}
          onSave={u => setMovs(prev => prev.map(m => m.id === editando.id ? { ...m, ...u } : m))}
          onClose={() => setEditando(null)}
        />
      )}
      {agregando && <AddModal cuentaId={cuentaId} periodo={periodo} cierreDay={cierreDay} venceDay={venceDay} categorias={categorias} subcategorias={subcategorias} onAdd={nuevos => setMovs(prev => [...prev, ...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha)))} onClose={() => setAgregando(false)} />}
      {importPdf && (
        <ImportarPdfModal
          cuentaId={cuentaId} periodo={periodo}
          cierreDay={cierreDay} venceDay={venceDay}
          movimientosExistentes={movs}
          categorias={categorias} subcategorias={subcategorias}
          onImported={nuevos => setMovs(prev => [...prev, ...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha)))}
          onClose={() => setImportPdf(false)}
        />
      )}
    </div>
  )
}
