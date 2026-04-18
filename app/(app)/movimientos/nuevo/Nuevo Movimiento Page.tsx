'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { NuevoItemModal } from '@/components/nuevo-item-modal'

type Cuenta = {
  id: string; nombre_cuenta: string; tipo_cuenta: string
  fecha_cierre_tarjeta: string | null; fecha_vencimiento_tarjeta: string | null
}
type Categoria = { id: string; nombre_categoria: string; tipo_default: string; icono: string | null }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

function calcularPeriodo(fecha: string, cuenta: Cuenta | undefined): string {
  if (!cuenta || cuenta.tipo_cuenta !== 'Tarjeta Credito') return fecha.slice(0, 7) + '-01'
  if (!cuenta.fecha_cierre_tarjeta || !cuenta.fecha_vencimiento_tarjeta) return fecha.slice(0, 7) + '-01'
  const fechaCompra   = new Date(fecha + 'T12:00:00')
  const fechaCierre   = new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00')
  const fechaVenc     = new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00')
  const cierreEsteMes = new Date(fechaCompra.getFullYear(), fechaCompra.getMonth(), fechaCierre.getDate())
  if (fechaCompra <= cierreEsteMes) return new Date(fechaVenc.getFullYear(), fechaVenc.getMonth(), 1).toISOString().slice(0, 10)
  return new Date(fechaVenc.getFullYear(), fechaVenc.getMonth() + 1, 1).toISOString().slice(0, 10)
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export default function NuevoMovimientoPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [cuentas, setCuentas]           = useState<Cuenta[]>([])
  const [categorias, setCategorias]     = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [modal, setModal]               = useState<'categoria' | 'subcategoria' | null>(null)
  const [cargado, setCargado]           = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    fecha: today, detalle: '', monto: '', moneda: 'ARS',
    cotizacion: '', conciliado: false,
    cuenta_origen: '', cuenta_destino: '',
    categoria: '', subcategoria: '', cuotas_total: '1',
  })

  useEffect(() => {
    fetch('/api/datos-formulario')
      .then(r => r.json())
      .then(({ cuentas: c, categorias: cat, subcategorias: sub }) => {
        setCuentas(c ?? [])
        setCategorias(cat ?? [])
        setSubcategorias(sub ?? [])

        // Pre-llenar desde query params (viene de "Registrar pago" en gastos fijos)
        const paramDetalle   = searchParams.get('detalle')   ?? ''
        const paramMonto     = searchParams.get('monto')     ?? ''
        const paramMoneda    = searchParams.get('moneda')    ?? 'ARS'
        const paramCuenta    = searchParams.get('cuenta')    ?? ''
        const paramCategoria = searchParams.get('categoria') ?? ''

        setForm(f => ({
          ...f,
          detalle:       paramDetalle  || f.detalle,
          monto:         paramMonto    || f.monto,
          moneda:        paramMoneda,
          cuenta_origen: paramCuenta   || (c?.length > 0 ? c[0].id : f.cuenta_origen),
          categoria:     paramCategoria || (cat?.length > 0 ? cat[0].id : f.categoria),
        }))
        setCargado(true)
      })
  }, [])

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const cuentaSeleccionada    = cuentas.find(c => c.id === form.cuenta_origen)
  const categoriaSeleccionada = categorias.find(c => c.id === form.categoria)
  const tipoMovimiento        = categoriaSeleccionada?.tipo_default ?? 'Gasto'
  const subcatsFiltradas      = subcategorias.filter(s => s.categoria_padre === form.categoria)
  const isUSD                 = form.moneda === 'USD'
  const isTarjeta             = cuentaSeleccionada?.tipo_cuenta === 'Tarjeta Credito'
  const isTransferencia       = tipoMovimiento === 'Transferencia'
  const cuentasDestino        = cuentas.filter(c => c.id !== form.cuenta_origen)
  const categoriasFiltradas   = categorias.filter(c =>
    tipoMovimiento === 'Gasto' ? c.tipo_default === 'Gasto' :
    tipoMovimiento === 'Ingreso' ? c.tipo_default === 'Ingreso' :
    c.tipo_default === 'Transferencia'
  )

  // Aviso de pre-llenado
  const vieneDePago = !!searchParams.get('detalle')

  const handleGuardar = async () => {
    if (!form.monto || !form.cuenta_origen || !form.categoria) return
    if (isTransferencia && !form.cuenta_destino) { alert('Seleccioná una cuenta destino'); return }
    setSaving(true)
    const cuotas = parseInt(form.cuotas_total) || 1
    const montoPorCuota = parseFloat(form.monto) / cuotas
    const records = []
    for (let i = 0; i < cuotas; i++) {
      const fechaCuota = addMonths(form.fecha, i)
      records.push({
        id: crypto.randomUUID(), fecha: fechaCuota,
        detalle: form.detalle || null, monto: montoPorCuota, moneda: form.moneda,
        tipo_movimiento: tipoMovimiento,
        cuenta_origen: form.cuenta_origen,
        cuenta_destino: isTransferencia ? form.cuenta_destino : null,
        categoria: form.categoria, subcategoria: form.subcategoria || null,
        cotizacion: isUSD && form.cotizacion ? parseFloat(form.cotizacion) : null,
        conciliado: form.conciliado,
        periodo_tarjeta: calcularPeriodo(fechaCuota, cuentaSeleccionada),
        cuotas_total: cuotas, cuota_actual: i + 1, ciclo_actual: i + 1,
      })
    }
    const res = await fetch('/api/movimientos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(records),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/movimientos'), 1000) }
    else { const { error } = await res.json(); alert('Error: ' + error) }
  }

  if (!cargado) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm">
          Cargando...
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">Nuevo movimiento</h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* Aviso de pre-llenado desde gasto fijo */}
        {vieneDePago && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-blue-600 font-medium">
              Formulario pre-llenado desde gastos fijos. Revisá los datos antes de guardar.
            </p>
            <button onClick={() => router.push('/movimientos/nuevo')} className="text-xs text-blue-400 hover:text-blue-600 underline ml-3">
              Limpiar
            </button>
          </div>
        )}

        {/* Tipo */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
          {['Gasto', 'Ingreso', 'Transferencia'].map(t => (
            <button key={t}
              onClick={() => { const cat = categorias.find(c => c.tipo_default === t); if (cat) set('categoria', cat.id) }}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${tipoMovimiento === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >{t}</button>
          ))}
        </div>

        {/* Fecha + Detalle */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Detalle</label>
            <input type="text" value={form.detalle} onChange={e => set('detalle', e.target.value)} placeholder="Ej: COTO supermercado" className={inputClass} />
          </div>
        </div>

        {/* Moneda + Monto */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={form.moneda} onChange={e => set('moneda', e.target.value)} className={inputClass}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Monto</label>
            <input type="number" step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" className={`${inputClass} text-lg font-mono`} />
          </div>
        </div>

        {/* USD */}
        {isUSD && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-xs font-medium text-amber-700 mb-1.5">Cotización histórica (opcional)</label>
              <input type="number" step="0.01" value={form.cotizacion} onChange={e => set('cotizacion', e.target.value)} placeholder="Ej: 1410" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none bg-white" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input type="checkbox" checked={form.conciliado} onChange={e => set('conciliado', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-amber-700">Conciliado</span>
            </label>
          </div>
        )}

        {/* Cuenta origen */}
        <div>
          <label className={labelClass}>{isTransferencia ? 'Cuenta origen' : 'Cuenta'}</label>
          <select value={form.cuenta_origen} onChange={e => set('cuenta_origen', e.target.value)} className={inputClass}>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre_cuenta} ({c.tipo_cuenta})</option>)}
          </select>
        </div>

        {/* Cuenta destino */}
        {isTransferencia && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <label className="block text-xs font-medium text-blue-700 mb-1.5">Cuenta destino</label>
            <select value={form.cuenta_destino} onChange={e => set('cuenta_destino', e.target.value)} className="w-full px-3 py-2.5 border border-blue-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 bg-white">
              <option value="">— seleccionar cuenta destino —</option>
              {cuentasDestino.map(c => <option key={c.id} value={c.id}>{c.nombre_cuenta} ({c.tipo_cuenta})</option>)}
            </select>
            <p className="text-xs text-blue-500 mt-2">Para pago de tarjeta, seleccioná la tarjeta como destino.</p>
          </div>
        )}

        {/* Categoría + Subcategoría */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">Categoría</label>
              <button onClick={() => setModal('categoria')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                <Plus size={12} /> Nueva
              </button>
            </div>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className={inputClass}>
              {categoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre_categoria}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">Subcategoría</label>
              <button onClick={() => setModal('subcategoria')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                <Plus size={12} /> Nueva
              </button>
            </div>
            <select value={form.subcategoria} onChange={e => set('subcategoria', e.target.value)} className={inputClass} disabled={subcatsFiltradas.length === 0}>
              <option value="">{subcatsFiltradas.length === 0 ? '(sin subcats)' : '— elegir —'}</option>
              {subcatsFiltradas.map(s => <option key={s.id} value={s.id}>{s.nombre_subcategoria}</option>)}
            </select>
          </div>
        </div>

        {/* Cuotas */}
        {tipoMovimiento === 'Gasto' && (
          <div>
            <label className={labelClass}>Cuotas (genera {form.cuotas_total} registro{parseInt(form.cuotas_total) > 1 ? 's' : ''})</label>
            <input type="number" min="1" max="36" value={form.cuotas_total} onChange={e => set('cuotas_total', e.target.value)} className={inputClass} />
          </div>
        )}

        {/* Preview periodo */}
        {form.fecha && form.cuenta_origen && (
          <div className="bg-slate-50 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-400">
              Periodo de imputación:
              <span className="ml-2 font-mono text-slate-600">
                {new Date(calcularPeriodo(form.fecha, cuentaSeleccionada) + 'T12:00:00')
                  .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
              </span>
              {isTarjeta && <span className="ml-2 text-amber-600">(tarjeta)</span>}
            </p>
          </div>
        )}

        <button
          onClick={handleGuardar}
          disabled={saving || saved}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, #1B3A6B, #1a6b5a)', opacity: saving ? 0.7 : 1 }}
        >
          {saved ? '✓ Guardado — redirigiendo...' : saving ? 'Guardando...' : 'Guardar movimiento'}
        </button>

      </div>

      {modal === 'categoria' && (
        <NuevoItemModal
          tipo="categoria"
          onCreado={(id, nombre, icono) => {
            const nueva: Categoria = { id, nombre_categoria: nombre, tipo_default: tipoMovimiento, icono: icono ?? null }
            setCategorias(prev => [...prev, nueva])
            set('categoria', id)
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'subcategoria' && (
        <NuevoItemModal
          tipo="subcategoria"
          categorias={categorias}
          categoriaActual={form.categoria}
          onCreado={(id, nombre) => {
            const nueva: Subcategoria = { id, nombre_subcategoria: nombre, categoria_padre: form.categoria }
            setSubcategorias(prev => [...prev, nueva])
            set('subcategoria', id)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
