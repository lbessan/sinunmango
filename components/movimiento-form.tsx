'use client'

// ─── components/movimiento-form.tsx ─────────────────────────────────────────
//
// FORMULARIO ÚNICO de edición de un movimiento. Es la fuente de verdad: se usa
// tal cual en la página /movimientos/[id]/editar y en el modal de
// /conciliaciones/[cuentaId]/[periodo]. Antes había dos formularios distintos y
// el de conciliaciones no dejaba cambiar la cuenta, ni aplicar el cambio a las
// cuotas hermanas, ni eliminar — el mismo movimiento ofrecía opciones distintas
// según desde dónde lo abrieras.
//
// El componente NO navega ni cierra nada: avisa por callbacks (onSaved,
// onCancel, onDeleted) y cada contenedor decide qué hacer. Así el mismo form
// sirve en una página y adentro de un modal.

import { useState, useEffect } from 'react'
import { Link2, AlertTriangle } from 'lucide-react'
import { CategoriaSelect } from '@/components/categoria-select'
import { calcularPeriodoCuenta } from '@/lib/tarjeta-periodo'

export type MovimientoEditable = {
  id:               string
  fecha:            string | null
  detalle:          string | null
  monto:            number
  moneda:           string | null
  cotizacion:       number | null
  conciliado:       boolean | null
  cuenta_origen:    string | null
  categoria:        string | null
  subcategoria:     string | null
  periodo_tarjeta:  string | null
  cuotas_total:     number | null
  cuota_actual:     number | null
  tipo_movimiento:  string | null
}

export type CuentaOpcion = {
  id: string
  nombre_cuenta: string
  tipo_cuenta: string
  fecha_cierre_tarjeta: string | null
  fecha_vencimiento_tarjeta: string | null
}
export type CategoriaOpcion = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string }
export type SubcategoriaOpcion = { id: string; categoria_padre: string; nombre_subcategoria: string }

/** Lo que devolvemos al contenedor cuando el guardado salió bien. */
export type MovimientoGuardado = {
  fecha:            string
  detalle:          string | null
  monto:            number
  moneda:           string
  cotizacion:       number | null
  conciliado:       boolean
  cuenta_origen:    string
  categoria:        string | null
  subcategoria:     string | null
  tipo_movimiento:  string
  periodo_tarjeta:  string
  categoria_nombre: string | null
  categoria_icono:  string | null
  monto_estimado:   number
}

type CuotaHermana = {
  id: string
  fecha: string
  detalle: string | null
  monto: number
  moneda: string
  cuota_actual: number
  cuotas_total: number
  periodo_tarjeta: string | null
  conciliado: boolean
}

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'
const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function MovimientoForm({
  movimiento,
  cuentas,
  categorias,
  subcategorias,
  onSaved,
  onCancel,
  onDeleted,
  textoGuardar = 'Guardar cambios',
}: {
  movimiento:    MovimientoEditable
  cuentas:       CuentaOpcion[]
  categorias:    CategoriaOpcion[]
  subcategorias: SubcategoriaOpcion[]
  /** Se llama tras el PATCH OK, con los valores ya guardados. */
  onSaved:       (mov: MovimientoGuardado) => void
  onCancel:      () => void
  /** Si no se pasa, no se muestra el bloque de eliminar. */
  onDeleted?:    () => void
  textoGuardar?: string
}) {
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,    setError]    = useState('')

  const [hermanas, setHermanas]                   = useState<CuotaHermana[]>([])
  const [aplicarAGrupo, setAplicarAGrupo]         = useState(false)
  const [eliminarTodoGrupo, setEliminarTodoGrupo] = useState(false)

  const [form, setForm] = useState({
    fecha:          movimiento.fecha ?? '',
    detalle:        movimiento.detalle ?? '',
    monto:          String(movimiento.monto ?? ''),
    moneda:         movimiento.moneda ?? 'ARS',
    cotizacion:     String(movimiento.cotizacion ?? ''),
    conciliado:     movimiento.conciliado ?? false,
    cuenta_origen:  movimiento.cuenta_origen ?? '',
    categoria:      movimiento.categoria ?? '',
    subcategoria:   movimiento.subcategoria ?? '',
    periodo_mes:    (movimiento.periodo_tarjeta ?? '').slice(0, 7),
    periodo_manual: false as boolean,
  })

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // Cuotas hermanas (para poder aplicar el cambio a todo el grupo)
  useEffect(() => {
    if ((movimiento.cuotas_total ?? 1) <= 1) return
    let cancelled = false
    fetch(`/api/movimientos/${movimiento.id}/grupo`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setHermanas(d.cuotas ?? []) })
      .catch(() => { /* silencioso: si falla, no ofrecemos la opción de grupo */ })
    return () => { cancelled = true }
  }, [movimiento.id, movimiento.cuotas_total])

  const cuentaSeleccionada    = cuentas.find(c => c.id === form.cuenta_origen)
  const categoriaSeleccionada = categorias.find(c => c.id === form.categoria)
  const subcatsFiltradas      = subcategorias.filter(s => s.categoria_padre === form.categoria)
  const isUSD                 = form.moneda === 'USD'
  const isTarjeta             = cuentaSeleccionada?.tipo_cuenta === 'Tarjeta Credito'

  const otrasCuotas   = hermanas.filter(h => h.id !== movimiento.id)
  const tieneHermanas = otrasCuotas.length > 0

  // Período: calculado con la MISMA función que usan los flujos automáticos.
  const periodoAuto = form.fecha && form.cuenta_origen
    ? calcularPeriodoCuenta(form.fecha, cuentaSeleccionada).slice(0, 7)
    : ''
  const periodoEfectivo = form.periodo_manual ? form.periodo_mes : periodoAuto
  const periodoLabel = periodoEfectivo
    ? new Date(periodoEfectivo + '-01T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : null

  const montoArs = isUSD && form.monto && form.cotizacion
    ? parseFloat(form.monto) * parseFloat(form.cotizacion)
    : null

  const handleGuardar = async () => {
    const montoNum = parseFloat(form.monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a cero.')
      return
    }
    setSaving(true)
    setError('')

    const periodo  = (periodoEfectivo || periodoAuto) + '-01'
    const cotizNum = isUSD && form.cotizacion ? parseFloat(form.cotizacion) : null
    const tipoMov  = categoriaSeleccionada?.tipo_default ?? movimiento.tipo_movimiento ?? 'Gasto'
    const url = aplicarAGrupo
      ? `/api/movimientos/${movimiento.id}?grupo=true`
      : `/api/movimientos/${movimiento.id}`

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Compartibles — se replican al grupo si aplicarAGrupo=true
        monto:           montoNum,
        moneda:          form.moneda,
        cotizacion:      cotizNum,
        conciliado:      form.conciliado,
        cuenta_origen:   form.cuenta_origen,
        categoria:       form.categoria || null,
        subcategoria:    form.subcategoria || null,
        tipo_movimiento: tipoMov,
        // Específicos de la cuota — el server los filtra si aplicarAGrupo=true
        fecha:           form.fecha,
        detalle:         form.detalle || null,
        periodo_tarjeta: periodo,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al guardar')
      return
    }

    setSaved(true)
    onSaved({
      fecha:            form.fecha,
      detalle:          form.detalle || null,
      monto:            montoNum,
      moneda:           form.moneda,
      cotizacion:       cotizNum,
      conciliado:       form.conciliado,
      cuenta_origen:    form.cuenta_origen,
      categoria:        form.categoria || null,
      subcategoria:     form.subcategoria || null,
      tipo_movimiento:  tipoMov,
      periodo_tarjeta:  periodo,
      categoria_nombre: categoriaSeleccionada?.nombre_categoria ?? null,
      categoria_icono:  categoriaSeleccionada?.icono ?? null,
      monto_estimado:   cotizNum ? montoNum * cotizNum : montoNum,
    })
  }

  const handleEliminar = async () => {
    if (!onDeleted) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const url = eliminarTodoGrupo
      ? `/api/movimientos/${movimiento.id}?grupo=true`
      : `/api/movimientos/${movimiento.id}`
    const res = await fetch(url, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { onDeleted(); return }
    const d = await res.json().catch(() => ({}))
    setError(d.error ?? 'Error al eliminar')
  }

  return (
    <div className="space-y-5">

      {/* Fecha + Detalle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Fecha</label>
          <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Detalle</label>
          <input type="text" value={form.detalle} onChange={e => set('detalle', e.target.value)} placeholder="Ej: COTO" className={inputClass} />
        </div>
      </div>

      {/* Moneda + Monto */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className={labelClass}>Moneda</label>
          <select value={form.moneda} onChange={e => set('moneda', e.target.value)} className={inputClass}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Monto</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={form.monto} onChange={e => set('monto', e.target.value)} className={`${inputClass} font-mono text-lg`} />
        </div>
      </div>

      {/* Cotización — solo aplica a USD */}
      {isUSD && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <label className="block text-xs font-medium text-amber-700 mb-1.5">Cotización histórica</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={form.cotizacion} onChange={e => set('cotizacion', e.target.value)} placeholder="Ej: 1410" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none bg-white" />
          {montoArs !== null && <p className="text-xs text-amber-700 font-medium mt-2">= ${fmt(montoArs)} ARS</p>}
          {!form.cotizacion && <p className="text-xs text-amber-500 mt-1">Sin cotización — el movimiento queda solo en U$S</p>}
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
          filtroTipo={categoriaSeleccionada?.tipo_default ?? movimiento.tipo_movimiento ?? undefined}
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

      {/* Conciliado: siempre visible. Antes estaba anidado dentro del bloque de
          dólares, así que en un movimiento en pesos no se podía tocar. */}
      <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 rounded-xl px-4 py-3">
        <input type="checkbox" checked={form.conciliado} onChange={e => set('conciliado', e.target.checked)} className="w-4 h-4" />
        <span className="text-sm text-slate-600">Conciliado</span>
        <span className="text-xs text-slate-400 ml-auto">Ya lo verifiqué contra el resumen</span>
      </label>

      {/* Período de imputación */}
      {(isTarjeta || form.cuenta_origen) && (
        <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Período de imputación</span>
            {!form.periodo_manual && periodoLabel && (
              <span className="text-slate-400">
                Auto: <span className="font-semibold text-slate-600">{periodoLabel}</span>
                {isTarjeta && <span className="ml-1 text-amber-500">(tarjeta)</span>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={form.periodo_manual ? form.periodo_mes : periodoAuto}
              onChange={e => { set('periodo_mes', e.target.value); set('periodo_manual', true) }}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
            />
            {form.periodo_manual && (
              <button onClick={() => set('periodo_manual', false)} className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap">
                Restaurar auto
              </button>
            )}
          </div>
          {form.periodo_manual && periodoEfectivo && (
            <p className="text-xs text-amber-600">⚠ Período sobreescrito manualmente</p>
          )}
        </div>
      )}

      {/* Cuotas hermanas: aplicar al grupo */}
      {tieneHermanas && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={aplicarAGrupo} onChange={e => setAplicarAGrupo(e.target.checked)} className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
                <Link2 size={14} />
                Aplicar a las {otrasCuotas.length} cuota{otrasCuotas.length !== 1 ? 's' : ''} restante{otrasCuotas.length !== 1 ? 's' : ''}
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Solo se replican monto, moneda, cuenta, categoría y conciliado.
                La fecha, el detalle y el período son específicos de cada cuota.
              </p>
              {aplicarAGrupo && (
                <details className="mt-2">
                  <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700">
                    Ver cuotas que se van a actualizar ({otrasCuotas.length})
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-blue-600 max-h-32 overflow-y-auto">
                    {otrasCuotas.map(c => (
                      <li key={c.id}>Cuota {c.cuota_actual}/{c.cuotas_total} · {c.fecha} · ${fmt(c.monto)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleGuardar}
          disabled={saving || saved}
          className="flex-1 py-3 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
        >
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : aplicarAGrupo ? `Guardar (${otrasCuotas.length + 1} cuotas)` : textoGuardar}
        </button>
      </div>

      {/* Eliminar */}
      {onDeleted && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          {tieneHermanas && (
            <label className="flex items-start gap-3 cursor-pointer bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <input type="checkbox" checked={eliminarTodoGrupo} onChange={e => setEliminarTodoGrupo(e.target.checked)} className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <AlertTriangle size={14} />
                  Eliminar también las {otrasCuotas.length} cuota{otrasCuotas.length !== 1 ? 's' : ''} restante{otrasCuotas.length !== 1 ? 's' : ''}
                </div>
                <p className="text-xs text-red-600 mt-1">
                  Si lo marcás, se borran las {otrasCuotas.length + 1} cuotas del grupo en lugar de solo esta.
                </p>
              </div>
            </label>
          )}

          <button
            onClick={handleEliminar}
            disabled={deleting}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
              confirmDelete ? 'bg-red-500 text-white hover:bg-red-600' : 'text-red-400 hover:bg-red-50 border border-red-100'
            }`}
          >
            {deleting
              ? 'Eliminando...'
              : confirmDelete
                ? eliminarTodoGrupo ? `¿Confirmar eliminación de ${otrasCuotas.length + 1} cuotas?` : '¿Confirmar eliminación?'
                : eliminarTodoGrupo ? `Eliminar ${otrasCuotas.length + 1} cuotas del grupo` : 'Eliminar movimiento'}
          </button>
          {confirmDelete && (
            <p className="text-xs text-center text-slate-400 mt-2">
              Hacé click de nuevo para confirmar · <button onClick={() => setConfirmDelete(false)} className="underline">cancelar</button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
