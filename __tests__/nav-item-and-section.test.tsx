// @vitest-environment happy-dom
//
// Tests para components/nav-item.tsx y components/nav-section.tsx.
// Componentes del sidebar.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// ─ Mock next/link y next/navigation ────────────────────────────────────────
const pathnameRef = { current: '/' }
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...rest }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
    [k: string]: unknown
  }) => <a href={href} onClick={onClick} {...rest}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}))

// ─ Mock sidebar-context (lo importa NavItem) ───────────────────────────────
const closeSidebarMock = vi.fn()
vi.mock('@/components/sidebar-context', () => ({
  useSidebar: () => ({ closeSidebar: closeSidebarMock, openSidebar: vi.fn() }),
}))

import { NavItem } from '@/components/nav-item'
import { NavSection } from '@/components/nav-section'

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
  pathnameRef.current = '/'
  closeSidebarMock.mockReset()
  localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NavItem', () => {
  it('renderea label + icon + href', () => {
    render(<NavItem href="/dashboard" icon={<span>I</span>} label="Inicio" />)
    const link = screen.getByText('Inicio').closest('a')
    expect(link?.getAttribute('href')).toBe('/dashboard')
  })

  it('exact: pathname matchea exacto → activo', () => {
    pathnameRef.current = '/dashboard'
    render(<NavItem href="/dashboard" icon={<span/>} label="Inicio" exact />)
    const link = screen.getByText('Inicio').closest('a')!
    expect(link.style.background).toContain('linear-gradient')
  })

  it('exact + pathname diferente → no activo', () => {
    pathnameRef.current = '/cuentas'
    render(<NavItem href="/dashboard" icon={<span/>} label="Inicio" exact />)
    const link = screen.getByText('Inicio').closest('a')!
    expect(link.className).toContain('text-slate-400')
  })

  it('no-exact: pathname prefix matchea → activo', () => {
    pathnameRef.current = '/cuentas/cta_1'
    render(<NavItem href="/cuentas" icon={<span/>} label="Cuentas" />)
    const link = screen.getByText('Cuentas').closest('a')!
    expect(link.style.background).toContain('linear-gradient')
  })

  it('no-exact: pathname distinto → no activo', () => {
    pathnameRef.current = '/dashboard'
    render(<NavItem href="/cuentas" icon={<span/>} label="Cuentas" />)
    const link = screen.getByText('Cuentas').closest('a')!
    expect(link.style.background).toBe('')
  })

  it('click llama closeSidebar (para drawer mobile)', () => {
    render(<NavItem href="/dashboard" icon={<span/>} label="Inicio" />)
    fireEvent.click(screen.getByText('Inicio'))
    expect(closeSidebarMock).toHaveBeenCalled()
  })

  it('tourId se pasa como data-tour', () => {
    render(<NavItem href="/x" icon={<span/>} label="L" tourId="tour-x" />)
    const link = screen.getByText('L').closest('a')!
    expect(link.getAttribute('data-tour')).toBe('tour-x')
  })
})

describe('NavSection — no collapsible', () => {
  it('renderea label uppercase + children', () => {
    render(
      <NavSection id="x" label="Mis cuentas">
        <a href="#">Item 1</a>
      </NavSection>
    )
    expect(screen.getByText('Mis cuentas')).toBeTruthy()
    expect(screen.getByText('Item 1')).toBeTruthy()
  })
})

describe('NavSection — collapsible', () => {
  it('default abierto → children visibles', () => {
    render(
      <NavSection id="x" label="Mis cuentas" collapsible>
        <a href="#">Item 1</a>
      </NavSection>
    )
    expect(screen.getByText('Item 1')).toBeTruthy()
    // Tiene chevron
    const btn = screen.getByText('Mis cuentas').closest('button')!
    const chevron = btn.querySelector('svg')
    expect(chevron).toBeTruthy()
    // Open state: no rotation
    expect(chevron?.getAttribute('class') ?? '').not.toContain('-rotate-90')
  })

  it('click toggle cierra la sección', () => {
    render(
      <NavSection id="x" label="Mis cuentas" collapsible>
        <a href="#">Item 1</a>
      </NavSection>
    )
    const btn = screen.getByText('Mis cuentas').closest('button')!
    fireEvent.click(btn)

    const chevron = btn.querySelector('svg')
    expect(chevron?.getAttribute('class') ?? '').toContain('-rotate-90')
  })

  it('persiste estado en localStorage por id', () => {
    render(
      <NavSection id="x" label="Mis cuentas" collapsible>
        <a href="#">Item 1</a>
      </NavSection>
    )
    fireEvent.click(screen.getByText('Mis cuentas').closest('button')!)
    expect(localStorage.getItem('nav-section-open-x')).toBe('false')

    fireEvent.click(screen.getByText('Mis cuentas').closest('button')!)
    expect(localStorage.getItem('nav-section-open-x')).toBe('true')
  })

  it('restaura estado desde localStorage en mount', () => {
    localStorage.setItem('nav-section-open-y', 'false')
    render(
      <NavSection id="y" label="Mis cuentas" collapsible defaultOpen={true}>
        <a href="#">Item 1</a>
      </NavSection>
    )
    // Después del useEffect, debería cerrarse aunque defaultOpen=true
    // (el localStorage tiene prioridad).
    const btn = screen.getByText('Mis cuentas').closest('button')!
    const chevron = btn.querySelector('svg')
    expect(chevron?.getAttribute('class') ?? '').toContain('-rotate-90')
  })

  it('defaultOpen=false → cerrado por default', () => {
    render(
      <NavSection id="z" label="Mis cuentas" collapsible defaultOpen={false}>
        <a href="#">Item 1</a>
      </NavSection>
    )
    const btn = screen.getByText('Mis cuentas').closest('button')!
    const chevron = btn.querySelector('svg')
    expect(chevron?.getAttribute('class') ?? '').toContain('-rotate-90')
  })
})
