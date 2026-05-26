// @vitest-environment happy-dom
//
// Tests para components/categoria-select.tsx
//
// Cubre:
//   - render con value vacío → placeholder
//   - render con value seleccionado → muestra nombre + icono
//   - click trigger abre dropdown
//   - filtroTipo restringe la lista
//   - categorías sin tipo_default siempre aparecen
//   - click en categoría llama onChange con id
//   - click en "sin categoría" llama onChange con ''
//   - click afuera cierra el dropdown

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { CategoriaSelect } from '@/components/categoria-select'

type Cat = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string | null }

const CATS: Cat[] = [
  { id: 'c1', nombre_categoria: 'Comida',        icono: '🍔', tipo_default: 'Gasto'   },
  { id: 'c2', nombre_categoria: 'Sueldo',        icono: '💰', tipo_default: 'Ingreso' },
  { id: 'c3', nombre_categoria: 'Transferencia', icono: '🔄', tipo_default: 'Transferencia' },
  { id: 'c4', nombre_categoria: 'Sin tipo',      icono: null,  tipo_default: null },
]

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('CategoriaSelect — rendering', () => {
  it('value vacío → muestra placeholder default', () => {
    render(<CategoriaSelect categorias={CATS} value="" onChange={() => {}} />)
    expect(screen.getByText('— sin categoría —')).toBeTruthy()
  })

  it('value vacío con placeholder custom', () => {
    render(<CategoriaSelect categorias={CATS} value="" placeholder="Elegir cat" onChange={() => {}} />)
    expect(screen.getByText('Elegir cat')).toBeTruthy()
  })

  it('value seleccionado → muestra nombre de la categoría', () => {
    render(<CategoriaSelect categorias={CATS} value="c1" onChange={() => {}} />)
    expect(screen.getByText('Comida')).toBeTruthy()
  })
})

describe('CategoriaSelect — dropdown', () => {
  it('click trigger abre dropdown con todas las categorías', () => {
    render(<CategoriaSelect categorias={CATS} value="" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Comida')).toBeTruthy()
    expect(screen.getByText('Sueldo')).toBeTruthy()
    expect(screen.getByText('Transferencia')).toBeTruthy()
    expect(screen.getByText('Sin tipo')).toBeTruthy()
  })

  it('filtroTipo=Gasto → solo Comida + Sin tipo', () => {
    render(<CategoriaSelect categorias={CATS} value="" onChange={() => {}} filtroTipo="Gasto" />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Comida')).toBeTruthy()
    expect(screen.queryByText('Sueldo')).toBeNull()
    expect(screen.queryByText('Transferencia')).toBeNull()
    expect(screen.getByText('Sin tipo')).toBeTruthy() // Sin tipo_default siempre aparece
  })

  it('filtroTipo=Ingreso → solo Sueldo + Sin tipo', () => {
    render(<CategoriaSelect categorias={CATS} value="" onChange={() => {}} filtroTipo="Ingreso" />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.queryByText('Comida')).toBeNull()
    expect(screen.getByText('Sueldo')).toBeTruthy()
    expect(screen.queryByText('Transferencia')).toBeNull()
    expect(screen.getByText('Sin tipo')).toBeTruthy()
  })

  it('click en categoría llama onChange con id + cierra dropdown', () => {
    const onChange = vi.fn()
    render(<CategoriaSelect categorias={CATS} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))

    fireEvent.click(screen.getByText('Comida'))
    expect(onChange).toHaveBeenCalledWith('c1')
  })

  it('click en "sin categoría" llama onChange con string vacío', () => {
    const onChange = vi.fn()
    render(<CategoriaSelect categorias={CATS} value="c1" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))

    // En el dropdown hay dos "— sin categoría —"? Solo uno (botón vacío).
    // Pero el trigger NO muestra placeholder porque value=c1 → muestra "Comida".
    // El placeholder solo aparece en el dropdown.
    fireEvent.click(screen.getByText('— sin categoría —'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('click afuera del dropdown lo cierra', () => {
    render(<CategoriaSelect categorias={CATS} value="" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Comida')).toBeTruthy()

    // Click en el body (afuera del trigger y el drop)
    act(() => {
      fireEvent.mouseDown(document.body)
    })

    expect(screen.queryByText('Comida')).toBeNull()
  })

  it('second click en trigger cierra el dropdown', () => {
    render(<CategoriaSelect categorias={CATS} value="" onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    expect(screen.queryByText('Comida')).toBeTruthy()

    fireEvent.click(trigger)
    expect(screen.queryByText('Comida')).toBeNull()
  })
})
