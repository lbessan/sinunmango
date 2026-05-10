'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, AlertTriangle } from 'lucide-react'
import { CategoriaSelect } from '@/components/categoria-select'
import { calcularPeriodoCuenta as calcularPeriodo } from '@/lib/tarjeta-periodo'

type Cuenta = {
  id: string
  nombre_cuenta: string
  tipo_cuenta: string
  fecha_cierre_tarjeta: string | null
  fecha_vencimiento_tarjeta: string | null
}
type Categoria = { id: string; nombre_categoria: string; icono: string | null; tipo_default: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

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

  // Cuotas hermanas — se cargan al montar si el movimiento es parte de un grupo
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

  // Cargar cuotas hermanas si corresponde
  useEffect(() => {
    if ((movimiento.cuotas_total ?? 1) <= 1) return
    let cancelled = false
    fetch(`/api/movimientos/${movimiento.id}/grupo`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setHermanas(d.cuotas ?? []) })
      .catch(() => { /* silencioso: si falla, simplemente no mostramos opción de grupo */ })
    return () => { cancelled = true }
  }, [movimiento.id, movimiento.cuotas_total])

  const cuentaSeleccionada    = cuentas.find(c => c.id === form.cuenta_origen)
  const categoriaSeleccionada = categorias.find(c => c.id === form.categoria)
  const subcatsFiltradas      = subcategorias.filter(s => s.categoria_padre === form.categoria)
  const isUSD                 = form.moneda === 'USD'
  const isTarjeta             = cuentaSeleccionada?.tipo_cuenta === 'Tarjeta Credito'

  // Excluímos la cuota actual de la lista — solo mostramos "las otras"
  const otrasCuotas    = hermanas.filter(h => h.id !== movimiento.id)
  const tieneHermanas  = otrasCuotas.length > 0

  const periodoAuto = form.fecha && form.cuenta_origen
    ? calcularPeriodo(form.fecha, cuentaSeleccionada).slice(0, 7)
    : ''
  const periodoEfectivo = form.periodo_manual ? form.periodo_mes : periodoAuto
  const periodoLabel = periodoEfectivo
    ? new Date(periodoEfectivo + '-01T12:00:00')
        .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : null

  const handleGuardar = async () => {
    setSaving(true)
    setError('')
    const periodo = (periodoEfectivo || periodoAuto) + '-01'

    const url = aplicarAGrupo
      ? `/api/movimientos/${movimiento.id}?grupo=true`
      : `/api/movimientos/${movimiento.id}`

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Campos compartibles — se replican al grupo si aplicarAGrupo=true
        monto:           parseFloat(form.monto) || 0,
        moneda:          form.moneda,
        cotizacion:      isUSD && form.cotizacion ? parseFloat(form.cotizacion) : null,
        conciliado:      form.conciliado,
        cuenta_origen:   form.cuenta_origen,
        categoria:       form.categoria || null,
        subcategoria:    form.subcategoria || null,
        tipo_movimiento: categoriaSeleccionada?.tipo_default ?? movimiento.tipo_movimiento,
        // Específicos de la cuota — se mandan siempre, el server filtra
        // automáticamente cuando aplicarAGrupo=true (CAMPOS_COMPARTIBLES whitelist)
        fecha:           form.fecha,
        detalle:         form.detalle || null,
        periodo_tarjeta: periodo,
      }),
    })

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => {
        router.refresh()
        router.back()
      }, 900)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al guardar')
    }
  }

  const handleEliminar = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const url = eliminarTodoGrupo
      ? `/api/movimientos/${movimiento.id}?grupo=true`
      : `/api/movimientos/${movimiento.id}`
    const res = await fetch(url, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      // El movimiento que este form está mostrando ya no existe (lo acabamos de
      // borrar, o cuando ?grupo=true, está dentro del grupo eliminado). Usamos
      // replace() en vez de back() para REEMPLAZAR la entrada del historial
      // — si hicieramos back() + refresh() en paralelo, Next.js intenta revalidar
      // la ruta de editar con un movimiento que ya no existe y queda un render
      // mezclado entre el form viejo y la lista nueva. revalidatePath en el
      // endpoint ya invalidó el RSC cache de /movimientos.
      router.replace('/movimientos')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al eliminar')
    }
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
                onChange={e => {
                  set('periodo_mes', e.target.value)
                  set('periodo_manual', true)
                }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
              />
              {form.periodo_manual && (
                <button
                  onClick={() => set('periodo_manual', false)}
                  className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap"
                >
                  Restaurar auto
                </button>
              )}
            </div>
            {form.periodo_manual && periodoEfectivo && (
              <p className="text-xs text-amber-600">
                ⚠ Período sobreescrito manualmente
              </p>
            )}
          </div>
        )}

        {/* ── Cuotas hermanas: toggle para aplicar al grupo ─────────────────── */}
        {tieneHermanas && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={aplicarAGrupo}
                onChange={e => setAplicarAGrupo(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0"
              />
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
                        <li key={c.id}>
                          Cuota {c.cuota_actual}/{c.cuotas_total} · {c.fecha} · ${fmt(c.monto)}
                        </li>
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
          <button onClick={() => router.back()} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
          >
            {saved
              ? '✓ Guardado'
              : saving
                ? 'Guardando...'
                : aplicarAGrupo ? `Guardar (${otrasCuotas.length + 1} cuotas)` : 'Guardar cambios'}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-2">
          {/* Toggle para eliminar todo el grupo */}
          {tieneHermanas && (
            <label className="flex items-start gap-3 cursor-pointer bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <input
                type="checkbox"
                checked={eliminarTodoGrupo}
                onChange={e => setEliminarTodoGrupo(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0"
              />
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
              confirmDelete
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-red-400 hover:bg-red-50 border border-red-100'
            }`}
          >
            {deleting
              ? 'Eliminando...'
              : confirmDelete
                ? eliminarTodoGrupo
                  ? `¿Confirmar eliminación de ${otrasCuotas.length + 1} cuotas?`
                  : '¿Confirmar eliminación?'
                : eliminarTodoGrupo
                  ? `Eliminar ${otrasCuotas.length + 1} cuotas del grupo`
                  : 'Eliminar movimiento'}
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
