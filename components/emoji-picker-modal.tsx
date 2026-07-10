'use client'

// ─── EmojiPickerModal — selector de emojis para categorías ───────────────────
//
// Reemplaza al IconPickerModal (que usaba iconos Lucide en indigo hardcoded).
// Usamos emojis porque el seed inicial del trigger SQL guarda emojis
// (`docs/migration-seed-categorias-en-trigger.sql`) — así el sistema queda
// unificado: lo que ves al onboarding, en la lista de categorías y en el
// editor es siempre el mismo emoji.
//
// La lista está agrupada para facilitar la búsqueda visual. El buscador filtra
// por keywords asociados a cada emoji (sin tildes, lowercase).

import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { EMOJIS, GRUPOS, type EmojiEntry } from '@/lib/emojis-catalogo'

// Normaliza: lowercase + sin tildes
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')


type Props = {
  open:     boolean
  current:  string | null
  onPick:   (emoji: string) => void
  onClose:  () => void
}

export function EmojiPickerModal({ open, current, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [grupo, setGrupo] = useState<string>('')
  const [customEmoji, setCustomEmoji] = useState('')

  const filtered = useMemo<EmojiEntry[]>(() => {
    const q = norm(query.trim())
    return EMOJIS.filter(e => {
      if (grupo && e.grupo !== grupo) return false
      if (!q) return true
      // El haystack incluye el grupo (así "transporte" matchea todos los
      // de transporte sin necesidad de keyword explícito en cada uno).
      const haystack = [norm(e.grupo), ...e.keywords].join(' ')
      return haystack.includes(q)
    })
  }, [query, grupo])

  if (!open) return null

  const pickAndClose = (emoji: string) => {
    onPick(emoji)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
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
            placeholder="Buscar emoji... (ej: super, nafta, gym, sueldo)"
            autoFocus
            className="flex-1 outline-none text-sm placeholder:text-slate-400"
          />
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filtro por grupo (chip scroll horizontal). Color de marca para el activo. */}
        <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setGrupo('')}
            className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap font-medium transition-colors ${!grupo ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            style={!grupo ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
          >
            Todos
          </button>
          {GRUPOS.map(g => (
            <button
              key={g}
              onClick={() => setGrupo(g)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap font-medium transition-colors ${grupo === g ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              style={grupo === g ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Grid de emojis */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm">Sin resultados para "{query}"</p>
              <button
                onClick={() => { setQuery(''); setGrupo('') }}
                className="text-xs mt-2 hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
              {filtered.map(e => {
                const isActive = current === e.emoji
                return (
                  <button
                    key={e.emoji + e.grupo}
                    onClick={() => pickAndClose(e.emoji)}
                    title={e.keywords[0]}
                    data-emoji={e.emoji}
                    className="aspect-square flex items-center justify-center rounded-xl p-1.5 transition-all hover:scale-110"
                    style={isActive
                      ? { background: 'color-mix(in srgb, var(--accent) 12%, white)', outline: '2px solid var(--accent)', outlineOffset: '1px' }
                      : { background: '#f8fafc' }}
                  >
                    <img
                      src={`/emojis/${e.slug}.svg`}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer: input custom emoji (fallback para emojis fuera del catálogo) */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500">
          <span className="shrink-0">¿Otro?</span>
          <input
            type="text"
            value={customEmoji}
            onChange={e => setCustomEmoji(e.target.value)}
            placeholder="Pegá tu emoji"
            maxLength={4}
            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-center text-base focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,var(--accent))]"
          />
          <button
            onClick={() => customEmoji.trim() && pickAndClose(customEmoji.trim())}
            disabled={!customEmoji.trim()}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            Usar
          </button>
          <span className="ml-auto text-slate-400">{filtered.length} emojis</span>
        </div>
      </div>
    </div>
  )
}
