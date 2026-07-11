// @vitest-environment happy-dom
//
// Tests para components/icono-categoria.tsx
//
// Ahora renderiza un glifo sólido monocromo (set Phosphor) desde
// /iconos/{slug}.svg sobre una pastilla de color pastel según el grupo.
// Resuelve el slug desde: emoji unicode, Lucide legacy, o genérico.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconoCategoria } from '@/components/icono-categoria'
import { GRUPO_COLOR } from '@/lib/emojis-catalogo'

const imgSrc = (c: HTMLElement) => c.querySelector('img')?.getAttribute('src') ?? ''
const tile = (c: HTMLElement) => c.firstChild as HTMLElement

describe('IconoCategoria', () => {
  it('emoji conocido → glifo sólido del slug correcto', () => {
    const { container } = render(<IconoCategoria icono="🛒" />)
    expect(imgSrc(container)).toBe('/iconos/shopping-cart.svg')
  })

  it('emoji conocido → pastilla con el color de su grupo', () => {
    const { container } = render(<IconoCategoria icono="🛒" />)   // Comida
    expect(tile(container).style.background).toBe(GRUPO_COLOR['Comida'])
  })

  it('Lucide legacy → mapea al emoji y su glifo', () => {
    const { container } = render(<IconoCategoria icono="ShoppingCart" />)
    expect(imgSrc(container)).toBe('/iconos/shopping-cart.svg')
  })

  it('otro Lucide legacy (Home) → house', () => {
    const { container } = render(<IconoCategoria icono="Home" />)
    expect(imgSrc(container)).toBe('/iconos/house.svg')
  })

  it('null → genérico label', () => {
    const { container } = render(<IconoCategoria icono={null} />)
    expect(imgSrc(container)).toBe('/iconos/label.svg')
  })

  it('Lucide desconocido → genérico label', () => {
    const { container } = render(<IconoCategoria icono="ThisIconDoesNotExist" />)
    expect(imgSrc(container)).toBe('/iconos/label.svg')
  })

  it('legacy kebab-case → genérico label', () => {
    const { container } = render(<IconoCategoria icono="shopping-cart" />)
    expect(imgSrc(container)).toBe('/iconos/label.svg')
  })

  it('respeta prop size (la pastilla mide size)', () => {
    const { container } = render(<IconoCategoria icono="🛒" size={40} />)
    expect(tile(container).style.width).toBe('40px')
    expect(tile(container).style.height).toBe('40px')
  })

  it('emoji custom (fuera del catálogo) → sin img, muestra el emoji', () => {
    const { container } = render(<IconoCategoria icono="🦖" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('🦖')
  })
})
