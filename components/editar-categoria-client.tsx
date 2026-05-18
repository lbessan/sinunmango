'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { ICONOS_CATEGORIAS } from '@/lib/iconos-categorias'
import { IconoCategoria } from '@/components/icono-categoria'
import { IconPickerModal } from '@/components/icon-picker-modal'
import { DeleteButton } from '@/components/delete-button'

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

type CategoriaProp = {
  id?: string
  nombre_categoria?: string | null
  icono?: string | null
  tipo_default?: string | null
}

export function EditarCategoriaClient({ categoria }: { categoria: CategoriaProp }) {
  const router  = useRouter()
  const [nombre, setNombre] = useState(categoria.nombre_categoria ?? '')
  const [icono,  setIcono]  = useState<string>(categoria.icono ?? 'ShoppingCart')
  const [tipo,   setTipo]   = useState(categoria.tipo_default ?? 'Gasto')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')

  const isNew = !categoria.id

  // Label legible del icono actual (si está en la lib) — solo informativo
  const iconoMeta = ICONOS_CATEGORIAS.find(i => i.name === icono)

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    const res = await fetch('/api/categorias', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isNew
          ? { nombre_categoria: nombre, icono, tipo_default: tipo }
          : { id: categoria.id, nombre_categoria: nombre, icono, tipo_default: tipo }
      ),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/categorias'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">
        {isNew ? 'Nueva categoría' : 'Editar categoría'}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* Preview grande con botón cambiar icono */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <button
            onClick={() => setPickerOpen(true)}
            className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-center shrink-0 group relative"
          >
            <IconoCategoria icono={icono} size={32} color="#475569" />
            {/* Badge "editar": visible siempre en mobile (no hay hover en touch);
                en sm+ aparece solo en hover para UI más limpia. */}
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Pencil size={11} />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-slate-800 truncate">{nombre || 'Nombre de la categoría'}</p>
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

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={inputClass} />
          </div>

          <div className="col-span-2">
            <label className={labelClass}>Tipo de movimiento</label>
            <div className="flex gap-2">
              {['Gasto', 'Ingreso', 'Transferencia'].map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`flex-1 py-2 text-xs rounded-lg font-medium transition-all border ${tipo === t ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  style={tipo === t ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : isNew ? 'Crear' : 'Guardar cambios'}
          </button>
        </div>

        {!isNew && categoria.id && (
          <div className="pt-2 border-t border-slate-100">
            <DeleteButton
              endpoint={`/api/categorias/${categoria.id}`}
              label={nombre}
              description="La categoría se eliminará permanentemente. Los movimientos existentes no se ven afectados."
              variant="button"
              redirectTo="/categorias"
            />
          </div>
        )}
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
