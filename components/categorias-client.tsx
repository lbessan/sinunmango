'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, X, Save } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'
import { NuevoItemModal } from '@/components/nuevo-item-modal'
import { ICONOS_CATEGORIAS, GRUPOS, urlIcono } from '@/lib/iconos-categorias'

type Categoria    = { id: string; nombre_categoria: string; icono: string | null; tipo_default: string | null }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string; icono: string | null }

// ─── Imagen con fallback ──────────────────────────────────────────────────────
function ImgIcono({ nombre, size }: { nombre: string; size: number }) {
  const [failedMain, setFailedMain] = useState(false)
  const [failedAlt,  setFailedAlt]  = useState(false)
  const alt = ICONOS_CATEGORIAS.find(i => i.nombre === nombre)?.alt ?? null
  if (failedAlt || (!alt && failedMain)) return <span style={{ fontSize: size * 0.8 }}>🏷️</span>
  if (failedMain && alt) return <img src={urlIcono(alt, 64)} alt={nombre} width={size} height={size} className="object-contain" loading="lazy" onError={() => setFailedAlt(true)} />
  return <img src={urlIcono(nombre, 64)} alt={nombre} width={size} height={size} className="object-contain" loading="lazy" onError={() => setFailedMain(true)} />
}

// ─── Popup editar subcategoría ────────────────────────────────────────────────
function EditarSubcatModal({ sub, categorias, onGuardado, onClose }: {
  sub: Subcategoria
  categorias: Categoria[]
  onGuardado: (updated: Subcategoria) => void
  onClose: () => void
}) {
  const [nombre,   setNombre]   = useState(sub.nombre_subcategoria)
  const [padreId,  setPadreId]  = useState(sub.categoria_padre)
  const [icono,    setIcono]    = useState(sub.icono ?? 'shopping-cart')
  const [busqueda, setBusqueda] = useState('')
  const [grupo,    setGrupo]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const iconosFiltrados = ICONOS_CATEGORIAS.filter(i => {
    const matchQ = !busqueda || i.label.toLowerCase().includes(busqueda.toLowerCase()) || i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchG = !grupo || i.grupo === grupo
    return matchQ && matchG
  })

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
            <ImgIcono nombre={icono} size={28} />
            <h3 className="text-sm font-semibold text-slate-800">Editar subcategoría</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
            <IconoCategoria icono={icono} size={40} />
            <div>
              <p className="text-sm font-medium text-slate-700">{nombre || 'Nombre'}</p>
              <p className="text-xs text-slate-400">{ICONOS_CATEGORIAS.find(i => i.nombre === icono)?.label ?? icono}</p>
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

          <div>
            <label className="block text-xs text-slate-500 mb-2">Ícono</label>
            <input type="text" value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setGrupo('') }}
              placeholder="Buscar ícono..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white mb-2" />

            <div className="flex gap-1.5 flex-wrap mb-2">
              <button onClick={() => { setGrupo(''); setBusqueda('') }}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${!grupo && !busqueda ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                style={!grupo && !busqueda ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
                Todos
              </button>
              {GRUPOS.map(g => (
                <button key={g} onClick={() => { setGrupo(g); setBusqueda('') }}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${grupo === g ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  style={grupo === g ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
                  {g}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1 border border-slate-100 rounded-xl p-2">
              {iconosFiltrados.map(item => {
                const sel = icono === item.nombre
                return (
                  <button key={item.nombre} onClick={() => setIcono(item.nombre)} title={item.label}
                    className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all ${sel ? 'bg-blue-50 ring-2 ring-blue-400 scale-105' : 'hover:bg-slate-50 hover:scale-105'}`}>
                    <ImgIcono nombre={item.nombre} size={30} />
                    <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight">{item.label}</span>
                  </button>
                )
              })}
              {iconosFiltrados.length === 0 && (
                <p className="col-span-5 text-center text-xs text-slate-400 py-4">Sin resultados</p>
              )}
            </div>
          </div>

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
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────
export function CategoriasClient({ categorias: catInicial, subcategorias: subInicial }: {
  categorias: Categoria[]
  subcategorias: Subcategoria[]
}) {
  const [subcategorias, setSubcategorias] = useState(subInicial)
  const [editandoSub,   setEditandoSub]   = useState<Subcategoria | null>(null)
  const [nuevaSubCatId, setNuevaSubCatId] = useState<string | null>(null)

  const grupos = catInicial.reduce<Record<string, Categoria[]>>((acc, cat) => {
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
