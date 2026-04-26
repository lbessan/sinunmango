'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'

interface NavGroupProps {
  icon:     React.ReactNode
  label:    string
  paths:    string[]          // rutas que activan el highlight/auto-expand del grupo
  children: React.ReactNode
  tourId?:  string
}

export function NavGroup({ icon, label, paths, children, tourId }: NavGroupProps) {
  const pathname      = usePathname()
  const isAnyActive   = paths.some(p => pathname === p || pathname.startsWith(p + '/'))
  const [open, setOpen] = useState(isAnyActive)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        data-tour={tourId}
        className={clsx(
          'w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all mx-2 rounded-lg',
          isAnyActive
            ? 'text-white'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        )}
        style={
          isAnyActive
            ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B) 0%, var(--accent, #1a6b5a) 100%)' }
            : {}
        }
      >
        <span style={isAnyActive ? { color: 'white', opacity: 0.9 } : {}}>{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          size={13}
          className="transition-transform duration-200 shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div className="pl-3 mt-0.5 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  )
}
