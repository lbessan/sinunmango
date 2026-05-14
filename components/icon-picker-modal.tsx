'use client'

// ─── IconPickerModal — selector visual de iconos para categorías ────────────
//
// Modal que muestra todos los iconos de `lib/iconos-categorias.ts` en grid,
// con buscador por tags + filtro por grupo. Click en uno selecciona y cierra.
//
// Búsqueda: normalizada sin tildes, matchea contra `label`, `name` y `tags`.
// Ej: el query "comida" matchea Pizza (tag), Restaurante (tag), Café (tag).

import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { ICONOS_CATEGORIAS, GRUPOS, type IconoDef } from '@/lib/iconos-categorias'
import { IconoCategoria } from './icono-categoria'

// Normaliza string: lowercase + sin tildes
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Props = {
  open:     boolean
  current:  string | null
  onPick:   (name: string) => void
  onClose:  () => void
}

export function IconPickerModal({ open, current, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [grupo, setGrupo] = useState<string>('')

  const iconos = useMemo<IconoDef[]>(() => {
    const q = norm(query.trim())
    return ICONOS_CATEGORIAS.filter(i => {
      if (grupo && i.grupo !== grupo) return false
      if (!q) return true
      const haystack = [
        norm(i.label),
        norm(i.name),
        ...i.tags.map(norm),
      ].join(' ')
      return haystack.includes(q)
    })
  }, [query, grupo])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header con search */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar icono... (ej: comida, super, casa, gym)"
            autoFocus
            className="flex-1 outline-none text-sm placeholder:text-slate-400"
          />
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {/* Filtro por grupo */}
        <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setGrupo('')}
            className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap font-medium transition-colors ${!grupo ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            style={!grupo ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
          >
            Todos
          </button>
          {GRUPOS.map(g => (
            <button
              key={g}
              onClick={() => setGrupo(g)}
              className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap font-medium transition-colors ${grupo === g ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              style={grupo === g ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Grid de iconos */}
        <div className="flex-1 overflow-y-auto p-4">
          {iconos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm">Sin resultados para "{query}"</p>
              <button onClick={() => { setQuery(''); setGrupo('') }} className="text-xs text-indigo-600 mt-2 hover:underline">
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
              {iconos.map(i => {
                const isActive = current === i.name
                return (
                  <button
                    key={i.name}
                    onClick={() => { onPick(i.name); onClose() }}
                    title={i.label}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all
                      ${isActive
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-slate-100 hover:bg-slate-50 hover:border-slate-200'}`}
                  >
                    <IconoCategoria icono={i.name} size={26} color={isActive ? '#6366f1' : '#475569'} />
                    <span className="text-[10px] text-slate-500 truncate w-full text-center leading-tight">
                      {i.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{iconos.length} iconos</span>
          <span>Click en uno para usarlo</span>
        </div>
      </div>
    </div>
  )
}
