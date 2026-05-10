'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Camera, Loader2 } from 'lucide-react'
import { NuevoItemModal } from '@/components/nuevo-item-modal'
import { CategoriaSelect } from '@/components/categoria-select'
import { calcularPeriodoCuenta as calcularPeriodo, addMonths } from '@/lib/tarjeta-periodo'

type Cuenta = {
  id: string; nombre_cuenta: string; tipo_cuenta: string
  fecha_cierre_tarjeta: string | null; fecha_vencimiento_tarjeta: string | null
}
type Categoria = { id: string; nombre_categoria: string; tipo_default: string; icono: string | null }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

function NuevoMovimientoContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [cuentas, setCuentas]           = useState<Cuenta[]>([])
  const [categorias, setCategorias]     = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [modal, setModal]               = useState<'categoria' | 'subcategoria' | null>(null)
  const [cargado, setCargado]           = useState(false)
  const [scanningTicket, setScanningTicket] = useState(false)
  const [scanMsg, setScanMsg]           = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

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

  const handleScanTicket = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanningTicket(true)
    setScanMsg(null)
    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res  = await fetch('/api/leer-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setScanMsg(data.error ?? 'No se pudo leer el ticket.')
        return
      }
      // Pre-fill form fields
      if (data.detalle) set('detalle', data.detalle)
      if (data.monto)   set('monto',   String(data.monto))
      if (data.moneda)  set('moneda',  data.moneda)
      if (data.fecha)   set('fecha',   data.fecha)
      if (data.cuotas)  set('cuotas_total', String(data.cuotas))
      setScanMsg('✓ Ticket leído — revisá los datos antes de guardar.')
    } catch {
      setScanMsg('Error al procesar la imagen.')
    } finally {
      setScanningTicket(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
    const detalleBase = (form.detalle || '').trim()
    const records = []
    for (let i = 0; i < cuotas; i++) {
      const fechaCuota = addMonths(form.fecha, i)
      // Si hay más de una cuota, agregamos sufijo "(Cuota N/T)" al detalle.
      // Ayuda a identificar la fila en listados y permite que el backfill SQL
      // futuro pueda agruparlas por regex si llegaran a perder el grupo_cuotas.
      const detalleFinal = cuotas > 1
        ? (detalleBase ? `${detalleBase} (Cuota ${i + 1}/${cuotas})` : `Cuota ${i + 1}/${cuotas}`)
        : (detalleBase || null)
      records.push({
        id: crypto.randomUUID(), fecha: fechaCuota,
        detalle: detalleFinal, monto: montoPorCuota, moneda: form.moneda,
        tipo_movimiento: tipoMovimiento,
        cuenta_origen: form.cuenta_origen,
        cuenta_destino: isTransferencia ? form.cuenta_destino : null,
        categoria: form.categoria, subcategoria: form.subcategoria || null,
        cotizacion: isUSD && form.cotizacion ? parseFloat(form.cotizacion) : null,
        conciliado: form.conciliado,
        periodo_tarjeta: calcularPeriodo(fechaCuota, cuentaSeleccionada),
        cuotas_total: cuotas, cuota_actual: i + 1, ciclo_actual: 1,
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-800">Nuevo movimiento</h1>
        {/* Escanear ticket con IA */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleScanTicket}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanningTicket}
            title="Fotografiar ticket"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
          >
            {scanningTicket
              ? <><Loader2 size={15} className="animate-spin" /> Leyendo...</>
              : <><Camera size={15} /> Escanear ticket</>
            }
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* Mensaje de escaneo */}
        {scanMsg && (
          <div className={`rounded-xl px-4 py-3 text-xs font-medium ${scanMsg.startsWith('✓') ? 'bg-green-50 border border-green-100 text-green-700' : 'bg-red-50 border border-red-100 text-red-600'}`}>
            {scanMsg}
          </div>
        )}

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

        {/* Categoría */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-500">Categoría</label>
            <button onClick={() => setModal('categoria')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
              <Plus size={12} /> Nueva
            </button>
          </div>
          <CategoriaSelect
            categorias={categorias}
            value={form.categoria}
            onChange={id => { set('categoria', id); set('subcategoria', '') }}
            filtroTipo={tipoMovimiento}
          />
        </div>

        {/* Subcategoría */}
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

        {/* Cuotas */}
        {tipoMovimiento === 'Gasto' && (
          <div>
            <label className={labelClass}>Cuotas</label>
            <div className="flex items-center gap-3">
              <input
                type="number" min="1" max="36"
                value={form.cuotas_total}
                onChange={e => set('cuotas_total', e.target.value)}
                className={`${inputClass} w-28 font-mono`}
              />
              {parseInt(form.cuotas_total) > 1 && form.monto && (
                <span className="text-sm text-slate-500">
                  = ${(parseFloat(form.monto) / parseInt(form.cuotas_total)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / cuota
                </span>
              )}
            </div>
          </div>
        )}

        {/* Preview período / distribución de cuotas */}
        {form.fecha && form.cuenta_origen && (
          <div className={`rounded-xl px-4 py-3 text-xs ${parseInt(form.cuotas_total) > 1 && tipoMovimiento === 'Gasto' ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}`}>
            {parseInt(form.cuotas_total) <= 1 || tipoMovimiento !== 'Gasto' ? (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Período de imputación</span>
                <span className="font-semibold text-slate-700">
                  {new Date(calcularPeriodo(form.fecha, cuentaSeleccionada) + 'T12:00:00')
                    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
                    .replace(/^\w/, c => c.toUpperCase())}
                  {isTarjeta && <span className="ml-2 text-amber-600 font-normal">(tarjeta)</span>}
                </span>
              </div>
            ) : (
              <div>
                <p className="text-blue-600 font-medium mb-2">{form.cuotas_total} cuotas — distribución de períodos:</p>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {Array.from({ length: parseInt(form.cuotas_total) }, (_, i) => {
                    const f = addMonths(form.fecha, i)
                    const p = calcularPeriodo(f, cuentaSeleccionada)
                    const label = new Date(p + 'T12:00:00')
                      .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
                      .replace(/^\w/, c => c.toUpperCase())
                    return (
                      <div key={i} className="flex justify-between text-slate-600">
                        <span>Cuota {i + 1}/{form.cuotas_total}</span>
                        <span className="font-medium">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleGuardar}
          disabled={saving || saved}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
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

export default function NuevoMovimientoPage() {
  return (
    <Suspense fallback={
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm">
          Cargando...
        </div>
      </div>
    }>
      <NuevoMovimientoContent />
    </Suspense>
  )
}
