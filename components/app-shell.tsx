'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { SidebarContext } from './sidebar-context'

interface AppShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [open, setOpen] = useState(false)
  const pathname        = usePathname()

  // Close drawer on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else      document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <SidebarContext.Provider value={{ closeSidebar: () => setOpen(false) }}>
      <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-main, #f1f5f9)' }}>

        {/* ── Desktop sidebar (lg+) ───────────────────────────────────────── */}
        <div className="hidden lg:block shrink-0">
          {sidebar}
        </div>

        {/* ── Mobile drawer ───────────────────────────────────────────────── */}
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity duration-300 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setOpen(false)}
        />
        {/* Drawer panel */}
        <div
          className={`fixed top-0 left-0 h-full z-50 lg:hidden transition-transform duration-300 ease-in-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Close button */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-[-44px] z-10 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white"
          >
            <X size={18} />
          </button>
          {sidebar}
        </div>

        {/* ── Main content ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Mobile top bar */}
          <header
            className="lg:hidden flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: 'var(--sidebar-bg, #0d2137)' }}
          >
            <button
              onClick={() => setOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Menu size={20} />
            </button>
            <p className="font-bold text-base">
              <span className="text-white">sinun</span>
              <span style={{ color: '#f97316' }}>mango</span>
            </p>
          </header>

          <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
            {children}
          </main>

        </div>
      </div>
    </SidebarContext.Provider>
  )
}
