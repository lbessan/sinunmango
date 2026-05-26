// @vitest-environment happy-dom
//
// Tests para components/icono-categoria.tsx
//
// Cubre los 4 modos:
//   - Lucide PascalCase → renderiza el icon component
//   - Emoji Unicode → renderiza el emoji
//   - Legacy kebab-case → fallback a 🏷️
//   - null/undefined → fallback a 🏷️
//   - PascalCase no existente en Lucide → fallback (no tira)

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconoCategoria } from '@/components/icono-categoria'

describe('IconoCategoria', () => {
  it('null → emoji genérico 🏷️', () => {
    const { container } = render(<IconoCategoria icono={null} />)
    expect(container.textContent).toBe('🏷️')
  })

  it('PascalCase Lucide existente → renderea componente Lucide (SVG)', () => {
    const { container } = render(<IconoCategoria icono="ShoppingCart" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // Tiene la clase del Lucide
    expect(svg?.getAttribute('class') ?? '').toMatch(/lucide-shopping-cart/i)
  })

  it('PascalCase Lucide inexistente → fallback', () => {
    const { container } = render(<IconoCategoria icono="ThisIconDoesNotExist" />)
    // No hay SVG (no es Lucide válido)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('emoji Unicode → renderea el emoji directo', () => {
    const { container } = render(<IconoCategoria icono="🛒" />)
    expect(container.textContent).toBe('🛒')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('legacy kebab-case → fallback a 🏷️ (forzar migración)', () => {
    const { container } = render(<IconoCategoria icono="shopping-cart" />)
    expect(container.textContent).toBe('🏷️')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('respeta prop size en emojis', () => {
    const { container } = render(<IconoCategoria icono="🛒" size={40} />)
    const span = container.querySelector('span')
    // size * 0.85 = 34
    expect(span?.getAttribute('style') ?? '').toMatch(/font-size:\s*34px/)
  })

  it('respeta prop size en Lucide icons', () => {
    const { container } = render(<IconoCategoria icono="Home" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
  })

  it('respeta prop color en Lucide icons', () => {
    const { container } = render(<IconoCategoria icono="Home" color="#ff0000" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('#ff0000')
  })

  it('texto raro (no PascalCase ni kebab ni emoji) se renderea como text', () => {
    const { container } = render(<IconoCategoria icono="?" />)
    expect(container.textContent).toBe('?')
  })

  it('icono vacío "" → fallback a 🏷️', () => {
    const { container } = render(<IconoCategoria icono="" />)
    expect(container.textContent).toBe('🏷️')
  })
})
