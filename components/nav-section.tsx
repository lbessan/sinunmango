'use client'

// ─── NavSection — header de grupo del sidebar (opcionalmente colapsable) ──────
//
// Renderiza el título tipo "Mis cuentas" en mayúsculas. Si recibe `collapsible`,
// el título se vuelve un botón que toggle la visibilidad del contenido.
// El estado abierto/cerrado se persiste en localStorage por `id`.

import { useState, useEffect, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

const STORAGE_KEY = (id: string) => `nav-section-open-${id}`

export function NavSection({
  id, label, collapsible = false, defaultOpen = true, children,
}: {
  id:           string
  label:        string
  collapsible?: boolean
  defaultOpen?: boolean
  children:     ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  // Restaurar estado guardado después del primer paint (evita hydration mismatch)
  useEffect(() => {
    if (!collapsible) return
    const stored = localStorage.getItem(STORAGE_KEY(id))
    if (stored !== null) setOpen(stored === 'true')
  }, [id, collapsible])

  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY(id), String(next)) } catch { /* silent */ }
      return next
    })
  }

  if (!collapsible) {
    return (
      <>
        <p className="text-xs uppercase tracking-widest px-5 py-2 mt-3" style={{ color: '#4b6a8a' }}>
          {label}
        </p>
        {children}
      </>
    )
  }

  return (
    <>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-2 mt-3 group hover:text-white/80 transition-colors"
        style={{ color: '#4b6a8a' }}
      >
        <span className="text-xs uppercase tracking-widest">{label}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden space-y-0.5">
          {children}
        </div>
      </div>
    </>
  )
}
