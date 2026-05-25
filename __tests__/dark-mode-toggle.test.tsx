// @vitest-environment happy-dom
//
// Tests para components/dark-mode-toggle.tsx
//
// El toggle tiene 2 botones (Claro / Oscuro). El comportamiento depende del
// plan del user:
//   - Pro: click cambia tema (si está en el otro modo) o no hace nada.
//   - Free: cualquier click abre el modal LimitReachedModal (feature
//     'personalizacion').
//
// Regresión que cubrimos: cualquier intento de click en Free debe abrir el
// modal, NO cambiar el tema sigilosamente.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const themeProviderMock = vi.hoisted(() => ({
  isDark:     false,
  toggleDark: vi.fn(),
}))

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => themeProviderMock,
}))

// Mock Link de Next para que renderee como <a> sin runtime
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) =>
    <a href={href} onClick={onClick}>{children}</a>,
}))

import { DarkModeToggle } from '@/components/dark-mode-toggle'

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
  themeProviderMock.isDark = false
  themeProviderMock.toggleDark.mockReset()
})

describe('DarkModeToggle — UI según plan', () => {
  it('Pro: NO muestra el badge de candado', () => {
    render(<DarkModeToggle hasProAccess={true} />)
    // El SVG del Lock no aparece — el componente usa <Lock> de lucide.
    // Como no lo podemos buscar por role, verificamos por la opacidad
    // del wrapper (que está atenuada solo en Free).
    const wrappers = document.querySelectorAll('.opacity-70')
    expect(wrappers.length).toBe(0)
  })

  it('Free: muestra el badge de candado (opacity-70 + Lock icon)', () => {
    render(<DarkModeToggle hasProAccess={false} />)
    expect(document.querySelector('.opacity-70')).toBeTruthy()
  })

  it('Free + modo claro: botón "Claro" tiene la pinta activa (bg-white)', () => {
    themeProviderMock.isDark = false
    render(<DarkModeToggle hasProAccess={false} />)
    const claroBtn = screen.getByText('Claro').closest('button')!
    expect(claroBtn.className).toContain('bg-white')
  })

  it('Free + modo oscuro: botón "Oscuro" tiene la pinta activa', () => {
    themeProviderMock.isDark = true
    render(<DarkModeToggle hasProAccess={false} />)
    const oscuroBtn = screen.getByText('Oscuro').closest('button')!
    expect(oscuroBtn.className).toContain('bg-white/20')
  })
})

describe('DarkModeToggle — comportamiento Free (gate por modal)', () => {
  it('click en "Claro" estando en modo claro → abre modal, NO toggle', () => {
    themeProviderMock.isDark = false
    render(<DarkModeToggle hasProAccess={false} />)
    fireEvent.click(screen.getByText('Claro'))
    expect(themeProviderMock.toggleDark).not.toHaveBeenCalled()
    expect(screen.getByText('La personalización es Pro')).toBeTruthy()
  })

  it('click en "Oscuro" estando en modo claro → abre modal, NO toggle', () => {
    themeProviderMock.isDark = false
    render(<DarkModeToggle hasProAccess={false} />)
    fireEvent.click(screen.getByText('Oscuro'))
    expect(themeProviderMock.toggleDark).not.toHaveBeenCalled()
    expect(screen.getByText('La personalización es Pro')).toBeTruthy()
  })

  it('click en "Claro" estando en modo oscuro → abre modal, NO toggle', () => {
    themeProviderMock.isDark = true
    render(<DarkModeToggle hasProAccess={false} />)
    fireEvent.click(screen.getByText('Claro'))
    expect(themeProviderMock.toggleDark).not.toHaveBeenCalled()
    expect(screen.getByText('La personalización es Pro')).toBeTruthy()
  })
})

describe('DarkModeToggle — comportamiento Pro', () => {
  it('Pro + claro: click en "Oscuro" → toggle', () => {
    themeProviderMock.isDark = false
    render(<DarkModeToggle hasProAccess={true} />)
    fireEvent.click(screen.getByText('Oscuro'))
    expect(themeProviderMock.toggleDark).toHaveBeenCalledTimes(1)
  })

  it('Pro + oscuro: click en "Claro" → toggle', () => {
    themeProviderMock.isDark = true
    render(<DarkModeToggle hasProAccess={true} />)
    fireEvent.click(screen.getByText('Claro'))
    expect(themeProviderMock.toggleDark).toHaveBeenCalledTimes(1)
  })

  it('Pro + ya en claro: click en "Claro" → NO toggle (idempotente)', () => {
    themeProviderMock.isDark = false
    render(<DarkModeToggle hasProAccess={true} />)
    fireEvent.click(screen.getByText('Claro'))
    expect(themeProviderMock.toggleDark).not.toHaveBeenCalled()
  })

  it('Pro + ya en oscuro: click en "Oscuro" → NO toggle (idempotente)', () => {
    themeProviderMock.isDark = true
    render(<DarkModeToggle hasProAccess={true} />)
    fireEvent.click(screen.getByText('Oscuro'))
    expect(themeProviderMock.toggleDark).not.toHaveBeenCalled()
  })

  it('Pro nunca abre el modal', () => {
    themeProviderMock.isDark = false
    render(<DarkModeToggle hasProAccess={true} />)
    fireEvent.click(screen.getByText('Oscuro'))
    expect(screen.queryByText('La personalización es Pro')).toBeNull()
  })
})
