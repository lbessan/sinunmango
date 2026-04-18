'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { IconoCategoria } from '@/components/icono-categoria'

type Categoria = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string | null }

type DropRect = { top: number; left: number; width: number; openUp: boolean }

type Props = {
  categorias: Categoria[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  filtroTipo?: string
  className?: string
}

export function CategoriaSelect({
  categorias, value, onChange,
  placeholder = '— sin categoría —',
  filtroTipo, className = '',
}: Props) {
  const [open, setOpen]           = useState(false)
  const [rect, setRect]           = useState<DropRect | null>(null)
  const btnRef                    = useRef<HTMLButtonElement>(null)
  const dropRef                   = useRef<HTMLDivElement>(null)

  const lista = filtroTipo
    ? categorias.filter(c => !c.tipo_default || c.tipo_default === filtroTipo)
    : categorias

  const seleccionada = lista.find(c => c.id === value) ?? null

  // Calcula posición fija del dropdown desde el botón trigger
  const calcRect = useCallback((): DropRect | null => {
    if (!btnRef.current) return null
    const r        = btnRef.current.getBoundingClientRect()
    const vh       = window.innerHeight
    const dropH    = Math.min(lista.length * 42 + 44, 224) // estimación
    const spaceBelow = vh - r.bottom
    const openUp   = spaceBelow < dropH + 8 && r.top > dropH + 8
    return {
      top:    openUp ? r.top - dropH - 4 : r.bottom + 4,
      left:   r.left,
      width:  r.width,
      openUp,
    }
  }, [lista.length])

  const handleToggle = () => {
    if (open) { setOpen(false); return }
    const r = calcRect()
    setRect(r)
    setOpen(true)
  }

  // Cierra al hacer click fuera
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Cierra si el scroll ocurre FUERA del dropdown (para no cerrar al scrollear la lista)
  useEffect(() => {
    if (!open) return
    const handler = (e: Event) => {
      if (dropRef.current?.contains(e.target as Node)) return // scroll interno → ignorar
      setOpen(false)
    }
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [open])

  return (
    <div className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          {seleccionada ? (
            <>
              <IconoCategoria key={seleccionada.icono ?? '__null__'} icono={seleccionada.icono} size={18} />
              <span className="text-slate-700 truncate">{seleccionada.nombre_categoria}</span>
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown — fixed al viewport, escapa de cualquier overflow */}
      {open && rect && (
        <div
          ref={dropRef}
          className="fixed z-[300] bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto max-h-56"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          {/* Opción vacía */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors ${!value ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}
          >
            <span className="w-5 shrink-0" />
            {placeholder}
          </button>

          {lista.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors ${value === c.id ? 'bg-blue-50' : ''}`}
            >
              <span className="shrink-0 w-5 flex items-center justify-center">
                <IconoCategoria icono={c.icono} size={18} />
              </span>
              <span className={`truncate ${value === c.id ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
                {c.nombre_categoria}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
