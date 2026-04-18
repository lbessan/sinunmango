'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CategoriaSelect } from '@/components/categoria-select'

type Cuenta = {
  id: string
  nombre_cuenta: string
  tipo_cuenta: string
  fecha_cierre_tarjeta: string | null
  fecha_vencimiento_tarjeta: string | null
}
type Categoria = { id: string; nombre_categoria: string; icono: string | null; tipo_default: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

function calcularPeriodo(fecha: string, cuenta: Cuenta | undefined): string {
  if (!cuenta || cuenta.tipo_cuenta !== 'Tarjeta Credito') return fecha.slice(0, 7) + '-01'
  if (!cuenta.fecha_cierre_tarjeta || !cuenta.fecha_vencimiento_tarjeta) return fecha.slice(0, 7) + '-01'
  const cierreDay = new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate()
  const venceDay  = new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate()
  const d   = new Date(fecha + 'T12:00:00')
  let mes   = d.getMonth()
  let anio  = d.getFullYear()
  const day = d.getDate()
  if (day <= cierreDay) {
    if (venceDay <= cierreDay) mes += 1
  } else {
    if (venceDay > cierreDay) mes += 1
    else                       mes += 2
  }
  while (mes > 11) { mes -= 12; anio++ }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function EditarMovimientoClient({
  movimiento,
  cuentas,
  categorias,
  subcategorias,
}: {
  movimiento: any
  cuentas: Cuenta[]
  categorias: Categoria[]
  subcategorias: Subcategoria[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    fecha:         movimiento.fecha ?? '',
    detalle:       movimiento.detalle ?? '',
    monto:         String(movimiento.monto ?? ''),
    moneda:        movimiento.moneda ?? 'ARS',
    cotizacion:    String(movimiento.cotizacion ?? ''),
    conciliado:    movimiento.conciliado ?? false,
    cuenta_origen: movimiento.cuenta_origen ?? '',
    categoria:     movimiento.categoria ?? '',
    subcategoria:  movimiento.subcategoria ?? '',
  })

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const cuentaSeleccionada  = cuentas.find(c => c.id === form.cuenta_origen)
  const categoriaSeleccionada = categorias.find(c => c.id === form.categoria)
  const subcatsFiltradas    = subcategorias.filter(s => s.categoria_padre === form.categoria)
  const isUSD               = form.moneda === 'USD'
  const isTarjeta           = cuentaSeleccionada?.tipo_cuenta === 'Tarjeta Credito'
  const periodoPreview      = form.fecha && form.cuenta_origen
    ? new Date(calcularPeriodo(form.fecha, cuentaSeleccionada) + 'T12:00:00')
        .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : null

  const handleGuardar = async () => {
    setSaving(true)
    setError('')
    const periodo = calcularPeriodo(form.fecha, cuentaSeleccionada)

    const res = await fetch(`/api/movimientos/${movimiento.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha:          form.fecha,
        detalle:        form.detalle || null,
        monto:          parseFloat(form.monto) || 0,
        moneda:         form.moneda,
        cotizacion:     isUSD && form.cotizacion ? parseFloat(form.cotizacion) : null,
        conciliado:     form.conciliado,
        cuenta_origen:  form.cuenta_origen,
        categoria:      form.categoria || null,
        subcategoria:   form.subcategoria || null,
        tipo_movimiento: categoriaSeleccionada?.tipo_default ?? movimiento.tipo_movimiento,
        periodo_tarjeta: periodo,
      }),
    })

    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/movimientos'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error al guardar') }
  }

  const handleEliminar = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const res = await fetch(`/api/movimientos/${movimiento.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) router.push('/movimientos')
    else { const d = await res.json(); setError(d.error ?? 'Error al eliminar') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-800">Editar movimiento</h1>
        {movimiento.cuotas_total > 1 && (
          <span className="text-xs bg-amber-50 text-amber-600 px-3 py-1 rounded-full font-medium">
            Cuota {movimiento.cuota_actual}/{movimiento.cuotas_total}
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Detalle</label>
            <input type="text" value={form.detalle} onChange={e => set('detalle', e.target.value)} placeholder="Ej: COTO" className={inputClass} />
          </div>
        </div>

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
            <input type="number" step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} className={`${inputClass} font-mono text-lg`} />
          </div>
        </div>

        {isUSD && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-xs font-medium text-amber-700 mb-1.5">Cotización histórica</label>
              <input type="number" step="0.01" value={form.cotizacion} onChange={e => set('cotizacion', e.target.value)} placeholder="Ej: 1410" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none bg-white" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input type="checkbox" checked={form.conciliado} onChange={e => set('conciliado', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-amber-700">Conciliado</span>
            </label>
          </div>
        )}

        <div>
          <label className={labelClass}>Cuenta</label>
          <select value={form.cuenta_origen} onChange={e => set('cuenta_origen', e.target.value)} className={inputClass}>
            {cuentas.map(c => (
              <option key={c.id} value={c.id}>{c.nombre_cuenta} ({c.tipo_cuenta})</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Categoría</label>
          <CategoriaSelect
            categorias={categorias}
            value={form.categoria}
            onChange={id => { set('categoria', id); set('subcategoria', '') }}
            filtroTipo={categoriaSeleccionada?.tipo_default ?? movimiento.tipo_movimiento}
          />
        </div>

        <div>
          <label className={labelClass}>Subcategoría</label>
          <select value={form.subcategoria} onChange={e => set('subcategoria', e.target.value)} className={inputClass} disabled={subcatsFiltradas.length === 0}>
            <option value="">{subcatsFiltradas.length === 0 ? '(sin subcats)' : '— elegir —'}</option>
            {subcatsFiltradas.map(s => (
              <option key={s.id} value={s.id}>{s.nombre_subcategoria}</option>
            ))}
          </select>
        </div>

        {periodoPreview && (
          <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">Período de imputación</span>
            <span className="font-semibold text-slate-700">
              {periodoPreview}
              {isTarjeta && <span className="ml-2 text-amber-600 font-normal">(tarjeta)</span>}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={handleEliminar}
            disabled={deleting}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
              confirmDelete
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-red-400 hover:bg-red-50 border border-red-100'
            }`}
          >
            {deleting ? 'Eliminando...' : confirmDelete ? '¿Confirmar eliminación?' : 'Eliminar movimiento'}
          </button>
          {confirmDelete && (
            <p className="text-xs text-center text-slate-400 mt-2">
              Hacé click de nuevo para confirmar · <button onClick={() => setConfirmDelete(false)} className="underline">cancelar</button>
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
