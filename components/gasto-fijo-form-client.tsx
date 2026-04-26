'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { NuevoItemModal } from '@/components/nuevo-item-modal'
import { CategoriaSelect } from '@/components/categoria-select'
import { DeleteButton } from '@/components/delete-button'

type GastoFijoForm = {
  id?: string
  nombre_gasto: string
  id_categoria: string
  id_subcategoria: string
  monto_estimado: string
  moneda: string
  dia_vencimiento: string
  cuenta_pago_default: string
  activo: boolean
}

type Categoria    = { id: string; nombre_categoria: string; icono: string | null }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }
type Cuenta       = { id: string; nombre_cuenta: string; tipo_cuenta: string }

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function GastoFijoFormClient({
  inicial, categorias: catInicial, subcategorias: subInicial, cuentas,
}: {
  inicial: GastoFijoForm
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  cuentas: Cuenta[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<GastoFijoForm>(inicial)
  const [categorias,   setCategorias]   = useState(catInicial)
  const [subcategorias] = useState(subInicial)
  const [saving, setSaving]         = useState(false)
  const [saved,  setSaved]          = useState(false)
  const [error,  setError]          = useState('')
  const [modal,  setModal]          = useState<'categoria' | null>(null)

  const set = (k: keyof GastoFijoForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const isEditing = !!form.id

  // Subcategorías filtradas según la categoría elegida
  const subcatsFiltradas = subcategorias.filter(s => s.categoria_padre === form.id_categoria)

  const handleGuardar = async () => {
    if (!form.nombre_gasto || !form.monto_estimado) {
      setError('Completá los campos obligatorios')
      return
    }
    setSaving(true)
    setError('')

    const body = {
      nombre_gasto:        form.nombre_gasto,
      id_categoria:        form.id_categoria || null,
      id_subcategoria:     form.id_subcategoria || null,
      monto_estimado:      parseFloat(form.monto_estimado) || 0,
      moneda:              form.moneda,
      dia_vencimiento:     form.dia_vencimiento ? parseInt(form.dia_vencimiento) : null,
      cuenta_pago_default: form.cuenta_pago_default || null,
      activo:              form.activo,
    }

    const res = await fetch(
      isEditing ? `/api/gastos-fijos/${form.id}` : '/api/gastos-fijos',
      { method: isEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )

    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/gastos-fijos'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error al guardar') }
  }

  return (
    <>
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-semibold text-slate-800 mb-6">
          {isEditing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
        </h1>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

          <div>
            <label className={labelClass}>Nombre *</label>
            <input type="text" value={form.nombre_gasto} onChange={e => set('nombre_gasto', e.target.value)}
              placeholder="Ej: Alquiler" className={inputClass} />
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
              <label className={labelClass}>Monto estimado *</label>
              <input type="number" step="0.01" value={form.monto_estimado} onChange={e => set('monto_estimado', e.target.value)}
                placeholder="0.00" className={`${inputClass} font-mono`} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">Categoría</label>
              <button onClick={() => setModal('categoria')}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                <Plus size={11} /> Nueva
              </button>
            </div>
            <CategoriaSelect
              categorias={categorias}
              value={form.id_categoria}
              onChange={id => { set('id_categoria', id); set('id_subcategoria', '') }}
            />
          </div>

          {subcatsFiltradas.length > 0 && (
            <div>
              <label className={labelClass}>Subcategoría</label>
              <select
                value={form.id_subcategoria}
                onChange={e => set('id_subcategoria', e.target.value)}
                className={inputClass}
              >
                <option value="">— ninguna —</option>
                {subcatsFiltradas.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre_subcategoria}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>Día de vencimiento</label>
            <input type="number" min="1" max="31" value={form.dia_vencimiento}
              onChange={e => set('dia_vencimiento', e.target.value)}
              placeholder="Ej: 15" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Cuenta de pago</label>
            <select value={form.cuenta_pago_default} onChange={e => set('cuenta_pago_default', e.target.value)} className={inputClass}>
              <option value="">— sin cuenta —</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre_cuenta} ({c.tipo_cuenta})</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="activo" checked={form.activo} onChange={e => set('activo', e.target.checked)} className="w-4 h-4" />
            <label htmlFor="activo" className="text-sm text-slate-600 cursor-pointer">Gasto activo</label>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => router.back()} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button onClick={handleGuardar} disabled={saving || saved}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
              {saved ? '✓ Guardado' : saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear gasto fijo'}
            </button>
          </div>

          {isEditing && form.id && (
            <div className="pt-2 border-t border-slate-100">
              <DeleteButton
                endpoint={`/api/gastos-fijos/${form.id}`}
                label={form.nombre_gasto}
                description="El gasto fijo se eliminará permanentemente."
                variant="button"
                redirectTo="/gastos-fijos"
              />
            </div>
          )}
        </div>
      </div>

      {modal === 'categoria' && (
        <NuevoItemModal
          tipo="categoria"
          categorias={categorias}
          onCreado={(id, nombre, icono) => {
            setCategorias(prev => [...prev, { id, nombre_categoria: nombre, icono: icono ?? null }])
            set('id_categoria', id)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
