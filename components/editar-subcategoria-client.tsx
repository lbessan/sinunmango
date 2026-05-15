'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { ICONOS_CATEGORIAS } from '@/lib/iconos-categorias'
import { IconoCategoria } from '@/components/icono-categoria'
import { IconPickerModal } from '@/components/icon-picker-modal'

type Categoria = { id: string; nombre_categoria: string; icono: string | null }

type SubcategoriaProp = {
  id?: string
  nombre_subcategoria?: string | null
  categoria_padre?: string | null
  icono?: string | null
}

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function EditarSubcategoriaClient({
  subcategoria,
  categorias,
  catIdActual,
}: {
  subcategoria: SubcategoriaProp
  categorias: Categoria[]
  catIdActual: string
}) {
  const router   = useRouter()
  const [nombre,  setNombre]  = useState(subcategoria.nombre_subcategoria ?? '')
  const [padreId, setPadreId] = useState(subcategoria.categoria_padre ?? catIdActual)
  const [icono,   setIcono]   = useState<string>(subcategoria.icono ?? 'ShoppingCart')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  const isNew = !subcategoria.id
  const iconoMeta = ICONOS_CATEGORIAS.find(i => i.name === icono)

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    const res = await fetch('/api/subcategorias', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isNew
          ? { nombre_subcategoria: nombre, categoria_padre: padreId, icono }
          : { id: subcategoria.id, nombre_subcategoria: nombre, categoria_padre: padreId, icono }
      ),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/categorias'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">
        {isNew ? 'Nueva subcategoría' : 'Editar subcategoría'}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* Preview con botón cambiar icono */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <button
            onClick={() => setPickerOpen(true)}
            className="w-14 h-14 rounded-2xl bg-white border-2 border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-center shrink-0 group relative"
          >
            <IconoCategoria icono={icono} size={28} color="#475569" />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil size={10} />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-slate-800 truncate">{nombre || 'Nombre de la subcategoría'}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {iconoMeta ? `${iconoMeta.label} · ${iconoMeta.grupo}` : icono}
            </p>
            <button
              onClick={() => setPickerOpen(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 font-medium"
            >
              Cambiar icono →
            </button>
          </div>
        </div>

        <div>
          <label className={labelClass}>Nombre *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={inputClass} autoFocus />
        </div>

        <div>
          <label className={labelClass}>Categoría padre</label>
          <select value={padreId} onChange={e => setPadreId(e.target.value)} className={inputClass}>
            <option value="">— seleccionar —</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre_categoria}</option>)}
          </select>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : isNew ? 'Crear' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <IconPickerModal
        open={pickerOpen}
        current={icono}
        onPick={(name) => setIcono(name)}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
