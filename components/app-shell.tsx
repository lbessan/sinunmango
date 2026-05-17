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
        {/* Drawer panel — sin overflow visible, sin botones flotantes adentro */}
        <div
          className={`fixed top-0 left-0 h-full z-50 lg:hidden transition-transform duration-300 ease-in-out overflow-hidden ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebar}
        </div>
        {/* Botón X — overlay independiente, fuera del drawer para que el transform no lo afecte */}
        <button
          onClick={() => setOpen(false)}
          className={`fixed z-50 lg:hidden w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white transition-all duration-300 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ top: 16, left: 272 }}
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>

        {/* ── Main content ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Mobile top bar — pt-safe agrega padding-top: env(safe-area-inset-top)
              para que el notch del iPhone en PWA standalone no tape el botón ☰.
              Como el header tiene background azul de marca, el área del notch
              queda coloreada (visual continuo con la status bar translúcida). */}
          <header
            className="lg:hidden flex items-center gap-3 px-4 py-3 pt-safe shrink-0"
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

          {/* paddingBottom: el FAB del ManguitoFlotante (fixed bottom:24, alto
              72px) tapa contenido al final de la página. Dejamos ~6rem de
              padding para que los botones/CTA del final no queden cubiertos.
              Sumamos safe-area-inset-bottom para que en iPhone PWA standalone
              el home indicator tampoco tape. En lg+ el FAB sigue presente
              pero el contenido es de columna más ancha y queda menos crítico
              — igual mantenemos 4rem por consistencia. */}
          <main
            className="flex-1 p-4 lg:p-8 overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
          >
            {children}
          </main>

        </div>
      </div>
    </SidebarContext.Provider>
  )
}
