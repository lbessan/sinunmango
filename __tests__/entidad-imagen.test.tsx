// @vitest-environment happy-dom
//
// Tests para components/entidad-imagen.tsx
//
// Componente de avatar/icono para bancos, billeteras, entidades.
// Renderea imagen si hay imagenUrl, fallback a icono o primera letra.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EntidadImagen } from '@/components/entidad-imagen'

// Mock next/image — renderea <img> normal
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string; width: number; height: number; className?: string }) =>
    <img src={props.src} alt={props.alt} width={props.width} height={props.height} className={props.className} />,
}))

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('EntidadImagen', () => {
  it('con imagenUrl → renderea <img>', () => {
    const { container } = render(<EntidadImagen imagenUrl="/galicia.png" nombre="Galicia" />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('/galicia.png')
    expect(img?.getAttribute('alt')).toBe('Galicia')
  })

  it('sin imagenUrl con icono → renderea fallback con icono', () => {
    const { container } = render(<EntidadImagen icono="🏦" nombre="Banco X" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('🏦')).toBeTruthy()
  })

  it('sin imagenUrl sin icono → renderea inicial del nombre uppercase', () => {
    render(<EntidadImagen nombre="galicia" />)
    expect(screen.getByText('G')).toBeTruthy()
  })

  it('size sm → 32px (w-8 h-8)', () => {
    const { container } = render(<EntidadImagen nombre="X" size="sm" />)
    const div = container.firstElementChild as HTMLElement
    expect(div.className).toContain('w-8')
  })

  it('size md (default) → 40px', () => {
    const { container } = render(<EntidadImagen nombre="X" />)
    const div = container.firstElementChild as HTMLElement
    expect(div.className).toContain('w-10')
  })

  it('size lg → 64px', () => {
    const { container } = render(<EntidadImagen nombre="X" size="lg" />)
    const div = container.firstElementChild as HTMLElement
    expect(div.className).toContain('w-16')
  })

  it('shape circle → rounded-full', () => {
    const { container } = render(<EntidadImagen nombre="X" shape="circle" />)
    const div = container.firstElementChild as HTMLElement
    expect(div.className).toContain('rounded-full')
  })

  it('shape rounded (default) → rounded-lg', () => {
    const { container } = render(<EntidadImagen nombre="X" />)
    const div = container.firstElementChild as HTMLElement
    expect(div.className).toContain('rounded-lg')
  })

  it('imagenUrl + shape circle → img tiene rounded-full', () => {
    const { container } = render(<EntidadImagen imagenUrl="/x.png" nombre="X" shape="circle" />)
    const img = container.querySelector('img')!
    expect(img.className).toContain('rounded-full')
  })

  it('respeta fallbackBg', () => {
    const { container } = render(<EntidadImagen nombre="X" fallbackBg="#ff0000" />)
    const div = container.firstElementChild as HTMLElement
    // happy-dom no normaliza hex a rgb() como jsdom; comparamos directo
    expect(div.style.background).toBe('#ff0000')
  })

  it('width/height en imagen = size px (lg=64)', () => {
    const { container } = render(<EntidadImagen imagenUrl="/x.png" nombre="X" size="lg" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('64')
    expect(img.getAttribute('height')).toBe('64')
  })
})
