// @vitest-environment happy-dom
//
// Tests para components/icono-categoria.tsx
//
// Ahora renderiza imágenes 3D (Fluent Emoji) desde /emojis/{slug}.svg.
// Resuelve el slug desde: emoji unicode, Lucide legacy, o genérico.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconoCategoria } from '@/components/icono-categoria'

const imgSrc = (container: HTMLElement) =>
  container.querySelector('img')?.getAttribute('src') ?? ''

describe('IconoCategoria', () => {
  it('emoji conocido → imagen Fluent del slug correcto', () => {
    const { container } = render(<IconoCategoria icono="🛒" />)
    expect(imgSrc(container)).toBe('/emojis/shopping-cart.svg')
  })

  it('Lucide legacy → mapea al emoji y su imagen', () => {
    const { container } = render(<IconoCategoria icono="ShoppingCart" />)
    expect(imgSrc(container)).toBe('/emojis/shopping-cart.svg')
  })

  it('otro Lucide legacy (Home) → house', () => {
    const { container } = render(<IconoCategoria icono="Home" />)
    expect(imgSrc(container)).toBe('/emojis/house.svg')
  })

  it('null → genérico label', () => {
    const { container } = render(<IconoCategoria icono={null} />)
    expect(imgSrc(container)).toBe('/emojis/label.svg')
  })

  it('Lucide desconocido → genérico label', () => {
    const { container } = render(<IconoCategoria icono="ThisIconDoesNotExist" />)
    expect(imgSrc(container)).toBe('/emojis/label.svg')
  })

  it('legacy kebab-case → genérico label', () => {
    const { container } = render(<IconoCategoria icono="shopping-cart" />)
    expect(imgSrc(container)).toBe('/emojis/label.svg')
  })

  it('respeta prop size (width/height del img)', () => {
    const { container } = render(<IconoCategoria icono="🛒" size={40} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('width')).toBe('40')
    expect(img?.getAttribute('height')).toBe('40')
  })

  it('emoji sin imagen local → fallback a span con el emoji', () => {
    // Un emoji que no está en el catálogo (no tiene slug)
    const { container } = render(<IconoCategoria icono="🦖" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('🦖')
  })
})
