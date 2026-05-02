'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { useSidebar } from './sidebar-context'

interface NavItemProps {
  href:    string
  icon:    React.ReactNode
  label:   string
  tourId?: string
  exact?:  boolean
}

export function NavItem({ href, icon, label, tourId, exact = false }: NavItemProps) {
  const pathname         = usePathname()
  const { closeSidebar } = useSidebar()
  const isActive         = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      onClick={closeSidebar}
      data-tour={tourId}
      className={clsx(
        'flex items-center gap-3 px-5 py-2 text-sm font-medium transition-all',
        isActive
          ? 'text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      )}
      style={isActive ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B) 0%, var(--accent, #1a6b5a) 100%)' } : {}}
    >
      <span style={isActive ? { color: 'white', opacity: 0.9 } : {}}>{icon}</span>
      {label}
    </Link>
  )
}
