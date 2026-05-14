'use client'

import { useState } from 'react'
import { X, Pencil } from 'lucide-react'
import { ICONOS_CATEGORIAS } from '@/lib/iconos-categorias'
import { IconoCategoria } from '@/components/icono-categoria'
import { IconPickerModal } from '@/components/icon-picker-modal'

type Categoria = { id: string; nombre_categoria: string; icono: string | null }

type Props = {
  tipo: 'categoria' | 'subcategoria'
  categorias?: Categoria[]
  categoriaActual?: string
  onCreado: (id: string, nombre: string, icono?: string) => void
  onClose: () => void
  zIndex?: number
}

export function NuevoItemModal({ tipo, categorias, categoriaActual, onCreado, onClose, zIndex = 60 }: Props) {
  const [nombre,  setNombre]  = useState('')
  const [icono,   setIcono]   = useState<string>('ShoppingCart')
  const [tipoMov, setTipoMov] = useState('Gasto')
  const [padreId, setPadreId] = useState(categoriaActual ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const iconoMeta = ICONOS_CATEGORIAS.find(i => i.name === icono)

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (tipo === 'subcategoria' && !padreId) { setError('Seleccioná una categoría padre'); return }
    setSaving(true)
    const body = tipo === 'categoria'
      ? { nombre_categoria: nombre.trim(), icono, tipo_default: tipoMov }
      : { nombre_subcategoria: nombre.trim(), categoria_padre: padreId, icono }
    const res = await fetch(`/api/${tipo === 'categoria' ? 'categorias' : 'subcategorias'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      const d = await res.json()
      onCreado(d.id, nombre.trim(), icono)
      onClose()
    } else {
      const d = await res.json(); setError(d.error ?? 'Error')
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white'

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', zIndex }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <IconoCategoria icono={icono} size={26} />
            <h3 className="text-sm font-semibold text-slate-800">
              {tipo === 'categoria' ? 'Nueva categoría' : 'Nueva subcategoría'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Preview con botón cambiar icono */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
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
              <p className="text-sm font-medium text-slate-700 truncate">{nombre || 'Nombre'}</p>
              <p className="text-xs text-slate-400">{iconoMeta ? `${iconoMeta.label} · ${iconoMeta.grupo}` : icono}</p>
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 font-medium"
              >
                Cambiar icono →
              </button>
            </div>
          </div>

          {/* Padre — solo subcategoría */}
          {tipo === 'subcategoria' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Categoría padre *</label>
              <select value={padreId} onChange={e => setPadreId(e.target.value)} className={inputClass}>
                <option value="">— seleccionar —</option>
                {(categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre_categoria}</option>)}
              </select>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGuardar()}
              placeholder={tipo === 'categoria' ? 'Ej: Cuidado Personal' : 'Ej: Peluquería'}
              className={inputClass} autoFocus />
          </div>

          {/* Tipo — solo categoría */}
          {tipo === 'categoria' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tipo</label>
              <div className="flex gap-2">
                {['Gasto', 'Ingreso', 'Transferencia'].map(t => (
                  <button key={t} onClick={() => setTipoMov(t)}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-medium border transition-all ${tipoMov === t ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    style={tipoMov === t ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : 'Crear'}
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
