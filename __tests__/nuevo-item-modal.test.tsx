// @vitest-environment happy-dom
//
// Tests para components/nuevo-item-modal.tsx
//
// Modal usado en /movimientos/nuevo para crear categoría o subcategoría
// inline sin salir del flow. Cubrimos:
//   - render tipo categoria (sin select padre) vs subcategoria (con select padre)
//   - validation: nombre vacío → error sin POST
//   - validation: subcategoria sin padre → error sin POST
//   - tipo selector solo aparece en categoría
//   - Enter en el input dispara guardar
//   - POST exitoso → onCreado + onClose
//   - POST con error → muestra error
//   - cancel button llama onClose
//   - icono default 🏷️ visible en preview

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { NuevoItemModal } from '@/components/nuevo-item-modal'

const ORIGINAL_FETCH = global.fetch

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.clearAllMocks()
})

const CATS = [
  { id: 'c1', nombre_categoria: 'Comida', icono: '🍔' },
  { id: 'c2', nombre_categoria: 'Sueldo', icono: '💰' },
]

describe('NuevoItemModal — categoría', () => {
  it('renderea título "Nueva categoría"', () => {
    render(<NuevoItemModal tipo="categoria" onCreado={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Nueva categoría')).toBeTruthy()
  })

  it('muestra selector de tipo (Gasto/Ingreso/Transferencia)', () => {
    render(<NuevoItemModal tipo="categoria" onCreado={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Gasto')).toBeTruthy()
    expect(screen.getByText('Ingreso')).toBeTruthy()
    expect(screen.getByText('Transferencia')).toBeTruthy()
  })

  it('NO muestra select de categoría padre', () => {
    render(<NuevoItemModal tipo="categoria" categorias={CATS} onCreado={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Categoría padre *')).toBeNull()
  })

  it('nombre vacío → muestra error sin llamar POST', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    render(<NuevoItemModal tipo="categoria" onCreado={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Crear'))

    await waitFor(() => {
      expect(screen.getByText('El nombre es obligatorio')).toBeTruthy()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('happy path: POST a /api/categorias con nombre + icono + tipo_default', async () => {
    let postBody: Record<string, unknown> | null = null
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      postBody = JSON.parse(init?.body as string)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'new-c' }) })
    }) as unknown as typeof fetch

    const onCreado = vi.fn()
    const onClose  = vi.fn()
    render(<NuevoItemModal tipo="categoria" onCreado={onCreado} onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText(/Cuidado Personal/), { target: { value: 'Mi cat' } })
    fireEvent.click(screen.getByText('Ingreso'))
    fireEvent.click(screen.getByText('Crear'))

    await waitFor(() => {
      expect(onCreado).toHaveBeenCalledWith('new-c', 'Mi cat', '🏷️')
    })
    expect(onClose).toHaveBeenCalled()
    expect(postBody).toMatchObject({ nombre_categoria: 'Mi cat', tipo_default: 'Ingreso', icono: '🏷️' })
  })

  it('Enter en el input dispara guardar', async () => {
    let postCalled = false
    global.fetch = vi.fn(() => {
      postCalled = true
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'new-c' }) })
    }) as unknown as typeof fetch

    render(<NuevoItemModal tipo="categoria" onCreado={() => {}} onClose={() => {}} />)
    const input = screen.getByPlaceholderText(/Cuidado Personal/)
    fireEvent.change(input, { target: { value: 'Test' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(postCalled).toBe(true))
  })

  it('error de API → muestra mensaje del error', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'Ya existe' }),
    })) as unknown as typeof fetch

    render(<NuevoItemModal tipo="categoria" onCreado={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Cuidado Personal/), { target: { value: 'x' } })
    fireEvent.click(screen.getByText('Crear'))

    await waitFor(() => {
      expect(screen.getByText('Ya existe')).toBeTruthy()
    })
  })

  it('cancel button llama onClose', () => {
    const onClose = vi.fn()
    render(<NuevoItemModal tipo="categoria" onCreado={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('NuevoItemModal — subcategoría', () => {
  it('renderea título "Nueva subcategoría"', () => {
    render(<NuevoItemModal tipo="subcategoria" categorias={CATS} onCreado={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Nueva subcategoría')).toBeTruthy()
  })

  it('muestra select de categoría padre con las opciones', () => {
    render(<NuevoItemModal tipo="subcategoria" categorias={CATS} onCreado={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Categoría padre *')).toBeTruthy()
    expect(screen.getByText('Comida')).toBeTruthy()
    expect(screen.getByText('Sueldo')).toBeTruthy()
  })

  it('NO muestra selector de tipo (Gasto/Ingreso/...)', () => {
    render(<NuevoItemModal tipo="subcategoria" categorias={CATS} onCreado={() => {}} onClose={() => {}} />)
    // El label "Tipo" del selector no aparece
    expect(screen.queryByText('Tipo')).toBeNull()
  })

  it('sin categoría padre seleccionada → error sin POST', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    render(<NuevoItemModal tipo="subcategoria" categorias={CATS} onCreado={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Peluquería/), { target: { value: 'Test sub' } })
    fireEvent.click(screen.getByText('Crear'))

    await waitFor(() => {
      expect(screen.getByText('Seleccioná una categoría padre')).toBeTruthy()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con categoriaActual prop, se preselecciona el padre', () => {
    render(<NuevoItemModal
      tipo="subcategoria" categorias={CATS}
      categoriaActual="c1"
      onCreado={() => {}} onClose={() => {}}
    />)
    const select = screen.getByDisplayValue('Comida') as HTMLSelectElement
    expect(select.value).toBe('c1')
  })

  it('happy path: POST a /api/subcategorias con padre + nombre + icono', async () => {
    let postUrl    = ''
    let postBody: Record<string, unknown> | null = null
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      postUrl  = url
      postBody = JSON.parse(init?.body as string)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'new-s' }) })
    }) as unknown as typeof fetch

    const onCreado = vi.fn()
    render(<NuevoItemModal
      tipo="subcategoria" categorias={CATS}
      categoriaActual="c1"
      onCreado={onCreado} onClose={() => {}}
    />)

    fireEvent.change(screen.getByPlaceholderText(/Peluquería/), { target: { value: 'Mi sub' } })
    fireEvent.click(screen.getByText('Crear'))

    await waitFor(() => {
      expect(onCreado).toHaveBeenCalledWith('new-s', 'Mi sub', '🏷️')
    })
    expect(postUrl).toBe('/api/subcategorias')
    expect(postBody).toMatchObject({ nombre_subcategoria: 'Mi sub', categoria_padre: 'c1' })
  })
})
