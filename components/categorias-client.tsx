'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, X, Save } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'
import { IconoCategoria } from '@/components/icono-categoria'
import { NuevoItemModal } from '@/components/nuevo-item-modal'
import { IconPickerModal } from '@/components/icon-picker-modal'
import { ICONOS_CATEGORIAS } from '@/lib/iconos-categorias'

type Categoria    = { id: string; nombre_categoria: string; icono: string | null; tipo_default: string | null }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string; icono: string | null }

// ─── Popup editar subcategoría ────────────────────────────────────────────────
function EditarSubcatModal({ sub, categorias, onGuardado, onClose }: {
  sub: Subcategoria
  categorias: Categoria[]
  onGuardado: (updated: Subcategoria) => void
  onClose: () => void
}) {
  const [nombre,   setNombre]   = useState(sub.nombre_subcategoria)
  const [padreId,  setPadreId]  = useState(sub.categoria_padre)
  const [icono,    setIcono]    = useState<string>(sub.icono ?? 'ShoppingCart')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const iconoMeta = ICONOS_CATEGORIAS.find(i => i.name === icono)

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    const res = await fetch('/api/subcategorias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id, nombre_subcategoria: nombre.trim(), categoria_padre: padreId, icono }),
    })
    setSaving(false)
    if (res.ok) {
      onGuardado({ ...sub, nombre_subcategoria: nombre.trim(), categoria_padre: padreId, icono })
    } else {
      const d = await res.json(); setError(d.error ?? 'Error')
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <IconoCategoria icono={icono} size={24} />
            <h3 className="text-sm font-semibold text-slate-800">Editar subcategoría</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Preview con botón cambiar icono */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
            <button
              onClick={() => setPickerOpen(true)}
              className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all flex items-center justify-center shrink-0 group relative"
            >
              <IconoCategoria icono={icono} size={24} color="#475569" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil size={9} />
              </span>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{nombre || 'Nombre'}</p>
              <p className="text-xs text-slate-400">{iconoMeta ? `${iconoMeta.label} · ${iconoMeta.grupo}` : icono}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGuardar()}
              className={inputClass} autoFocus />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Categoría padre</label>
            <select value={padreId} onChange={e => setPadreId(e.target.value)} className={inputClass}>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre_categoria}</option>)}
            </select>
          </div>

          <button
            onClick={() => setPickerOpen(true)}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            <Pencil size={13} /> Cambiar icono
          </button>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-5 pb-5 pt-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
            <Save size={13} />{saving ? 'Guardando...' : 'Guardar cambios'}
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

// ─── Componente principal ──────────────────────────────────────────────────────
export function CategoriasClient({ categorias: catInicial, subcategorias: subInicial }: {
  categorias: Categoria[]
  subcategorias: Subcategoria[]
}) {
  const [categorias,    setCategorias]    = useState(catInicial)
  const [subcategorias, setSubcategorias] = useState(subInicial)
  const [editandoSub,   setEditandoSub]   = useState<Subcategoria | null>(null)
  const [nuevaSubCatId, setNuevaSubCatId] = useState<string | null>(null)

  const grupos = categorias.reduce<Record<string, Categoria[]>>((acc, cat) => {
    const tipo = cat.tipo_default ?? 'Otros'
    if (!acc[tipo]) acc[tipo] = []
    acc[tipo].push(cat)
    return acc
  }, {})

  const colorGrupo: Record<string, { badge: string; dot: string }> = {
    Gasto:         { badge: 'text-red-500 bg-red-50',        dot: 'bg-red-400' },
    Ingreso:       { badge: 'text-emerald-600 bg-emerald-50', dot: 'bg-emerald-400' },
    Transferencia: { badge: 'text-blue-500 bg-blue-50',      dot: 'bg-blue-400' },
    Otros:         { badge: 'text-slate-500 bg-slate-100',   dot: 'bg-slate-400' },
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Categorías</h1>
        <Link href="/categorias/nueva"
          className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
          <Plus size={15} />Nueva categoría
        </Link>
      </div>

      {Object.entries(grupos).map(([tipo, cats]) => {
        const colors = colorGrupo[tipo] ?? colorGrupo.Otros
        return (
          <div key={tipo} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.badge}`}>
                {tipo}
              </span>
              <span className="text-xs text-slate-400">{cats.length} categorías</span>
            </div>

            {cats.map(cat => {
              const subs = subcategorias.filter(s => s.categoria_padre === cat.id)
              return (
                <div key={cat.id} className="border-b border-slate-50 last:border-0">
                  <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 flex items-center justify-center shrink-0">
                        <IconoCategoria icono={cat.icono} size={30} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{cat.nombre_categoria}</p>
                        {subs.length > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {subs.length} subcategoría{subs.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {/* + Subcat → abre popup en vez de navegar */}
                      <button
                        onClick={() => setNuevaSubCatId(cat.id)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                        <Plus size={11} />Subcat
                      </button>
                      <Link href={`/categorias/${cat.id}/editar`}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                        <Pencil size={14} />
                      </Link>
                      <DeleteButton
                        endpoint={`/api/categorias/${cat.id}`}
                        label={cat.nombre_categoria}
                        description="Esta acción eliminará la categoría y no se puede deshacer."
                        variant="icon"
                        onSuccess={() => {
                          setCategorias(prev => prev.filter(c => c.id !== cat.id))
                          setSubcategorias(prev => prev.filter(s => s.categoria_padre !== cat.id))
                        }}
                      />
                    </div>
                  </div>

                  {subs.length > 0 && (
                    <div className="px-5 pb-3 space-y-1">
                      {subs.map(sub => (
                        <div key={sub.id}
                          className="flex items-center justify-between pl-12 pr-2 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              <IconoCategoria icono={sub.icono} size={18} />
                            </div>
                            <span className="text-xs font-medium text-slate-600">
                              {sub.nombre_subcategoria}
                            </span>
                          </div>
                          {/* Lápiz → abre popup en vez de navegar */}
                          <button
                            onClick={() => setEditandoSub(sub)}
                            className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-200 transition-colors opacity-0 group-hover:opacity-100">
                            <Pencil size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Popup editar subcategoría */}
      {editandoSub && (
        <EditarSubcatModal
          sub={editandoSub}
          categorias={catInicial}
          onGuardado={updated => {
            setSubcategorias(prev => prev.map(s => s.id === updated.id ? updated : s))
            setEditandoSub(null)
          }}
          onClose={() => setEditandoSub(null)}
        />
      )}

      {/* Popup nueva subcategoría */}
      {nuevaSubCatId && (
        <NuevoItemModal
          tipo="subcategoria"
          categorias={catInicial}
          categoriaActual={nuevaSubCatId}
          onCreado={(id, nombre, icono) => {
            setSubcategorias(prev => [...prev, {
              id, nombre_subcategoria: nombre,
              categoria_padre: nuevaSubCatId, icono: icono ?? null,
            }])
            setNuevaSubCatId(null)
          }}
          onClose={() => setNuevaSubCatId(null)}
        />
      )}
    </div>
  )
}
