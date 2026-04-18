'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { ICONOS_CATEGORIAS, GRUPOS, urlIcono } from '@/lib/iconos-categorias'

type Categoria = { id: string; nombre_categoria: string; icono: string | null }

type Props = {
  tipo: 'categoria' | 'subcategoria'
  categorias?: Categoria[]
  categoriaActual?: string
  onCreado: (id: string, nombre: string, icono?: string) => void
  onClose: () => void
  zIndex?: number
}

function ImgIcono({ nombre, size }: { nombre: string; size: number }) {
  const [failedMain, setFailedMain] = useState(false)
  const [failedAlt,  setFailedAlt]  = useState(false)
  const alt = ICONOS_CATEGORIAS.find(i => i.nombre === nombre)?.alt ?? null
  if (failedAlt || (!alt && failedMain)) return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>🏷️</span>
  if (failedMain && alt) return <img src={urlIcono(alt, 64)} alt={nombre} width={size} height={size} className="object-contain" loading="lazy" onError={() => setFailedAlt(true)} />
  return <img src={urlIcono(nombre, 64)} alt={nombre} width={size} height={size} className="object-contain" loading="lazy" onError={() => setFailedMain(true)} />
}

export function NuevoItemModal({ tipo, categorias, categoriaActual, onCreado, onClose, zIndex = 60 }: Props) {
  const [nombre,   setNombre]   = useState('')
  const [icono,    setIcono]    = useState('shopping-cart')
  const [tipoMov,  setTipoMov]  = useState('Gasto')
  const [padreId,  setPadreId]  = useState(categoriaActual ?? '')
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
            <ImgIcono nombre={icono} size={32} />
            <h3 className="text-sm font-semibold text-slate-800">
              {tipo === 'categoria' ? 'Nueva categoría' : 'Nueva subcategoría'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
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

          {/* Picker de ícono — para categoría y subcategoría */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">Ícono</label>
            <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); setGrupo('') }}
              placeholder="Buscar ícono..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white mb-2" />

            {/* Tabs de grupo */}
            <div className="flex gap-1.5 flex-wrap mb-3">
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

            {/* Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-52 overflow-y-auto pr-1">
              {iconosFiltrados.map(item => {
                const sel = icono === item.nombre
                return (
                  <button key={item.nombre} onClick={() => setIcono(item.nombre)} title={item.label}
                    className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all ${sel ? 'bg-blue-50 ring-2 ring-blue-400 scale-105' : 'hover:bg-slate-50 hover:scale-105'}`}>
                    <ImgIcono nombre={item.nombre} size={36} />
                    <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight">{item.label}</span>
                  </button>
                )
              })}
              {iconosFiltrados.length === 0 && (
                <p className="col-span-5 text-center text-xs text-slate-400 py-6">Sin resultados</p>
              )}
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 mt-3 px-4 py-3 bg-slate-50 rounded-xl">
              <ImgIcono nombre={icono} size={40} />
              <div>
                <p className="text-sm font-medium text-slate-700">{nombre || 'Nombre'}</p>
                <p className="text-xs text-slate-400">{ICONOS_CATEGORIAS.find(i => i.nombre === icono)?.label}</p>
              </div>
            </div>
          </div>

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
    </div>
  )
}
