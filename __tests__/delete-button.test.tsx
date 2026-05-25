// @vitest-environment happy-dom
//
// Tests para components/delete-button.tsx
//
// Componente reutilizable de "Eliminar con confirmación". Usado en toda la
// app para borrar cuentas, tarjetas, movimientos, etc. Si esto se rompe,
// queda bug en todas partes simultáneamente — buena cobertura es crítica.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push:    vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

import { DeleteButton } from '@/components/delete-button'

beforeEach(() => {
  cleanup()
  routerMock.replace.mockReset()
  routerMock.refresh.mockReset()
  // Mock fetch
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeleteButton — rendering', () => {
  it('variant=button (default) → renderea botón con label "Eliminar"', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" />)
    expect(screen.getByText('Eliminar')).toBeTruthy()
  })

  it('variant=icon → renderea sin texto "Eliminar" visible', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" variant="icon" />)
    // El icon-only variant tiene title="Eliminar" pero no texto visible
    expect(screen.queryByText('Eliminar')).toBeNull()
    // Hay un trigger clickeable
    const trigger = document.querySelector('button[title="Eliminar"]')
    expect(trigger).toBeTruthy()
  })

  it('modal de confirmación cerrado por default', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" />)
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull()
  })
})

describe('DeleteButton — abrir/cerrar modal', () => {
  it('click en trigger abre el modal', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" label="esta cuenta" />)
    fireEvent.click(screen.getByText('Eliminar'))
    expect(screen.getByText(/no se puede deshacer/i)).toBeTruthy()
    expect(screen.getByText(/¿Eliminar esta cuenta\?/)).toBeTruthy()
  })

  it('click en X cierra el modal', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" />)
    fireEvent.click(screen.getByText('Eliminar'))
    // X del modal: el botón con clase absolute top-4 right-4
    const closeBtn = document.querySelector('button.absolute.top-4.right-4')!
    fireEvent.click(closeBtn)
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull()
  })

  it('click en backdrop cierra el modal', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" />)
    fireEvent.click(screen.getByText('Eliminar'))
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/40')!
    fireEvent.click(backdrop)
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull()
  })

  it('click en Cancelar cierra el modal', () => {
    render(<DeleteButton endpoint="/api/cuentas/x" />)
    fireEvent.click(screen.getByText('Eliminar'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull()
  })
})

describe('DeleteButton — flujo de delete', () => {
  it('happy path con redirectTo: fetch DELETE + router.replace', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<DeleteButton endpoint="/api/cuentas/c1" redirectTo="/cuentas" />)
    fireEvent.click(screen.getByText('Eliminar'))
    fireEvent.click(screen.getByText('Sí, eliminar'))

    // Esperar a que el async fetch + handlers terminen
    await new Promise(r => setTimeout(r, 30))

    expect(fetchMock).toHaveBeenCalledWith('/api/cuentas/c1', { method: 'DELETE' })
    expect(routerMock.replace).toHaveBeenCalledWith('/cuentas')
    // El modal se cierra al final
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull()
  })

  it('happy path sin redirectTo ni onSuccess: router.refresh', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<DeleteButton endpoint="/api/cuentas/c1" />)
    fireEvent.click(screen.getByText('Eliminar'))
    fireEvent.click(screen.getByText('Sí, eliminar'))
    await new Promise(r => setTimeout(r, 30))

    expect(routerMock.refresh).toHaveBeenCalledTimes(1)
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('happy path con onSuccess callback: lo invoca, NO router', async () => {
    const onSuccess = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))

    render(<DeleteButton endpoint="/api/cuentas/c1" onSuccess={onSuccess} />)
    fireEvent.click(screen.getByText('Eliminar'))
    fireEvent.click(screen.getByText('Sí, eliminar'))
    await new Promise(r => setTimeout(r, 30))

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(routerMock.replace).not.toHaveBeenCalled()
    expect(routerMock.refresh).not.toHaveBeenCalled()
  })

  it('error response 400 → muestra el mensaje del error en el modal, no cierra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'No se puede eliminar — tiene movimientos asociados',
    }), { status: 400 })))

    render(<DeleteButton endpoint="/api/cuentas/c1" />)
    fireEvent.click(screen.getByText('Eliminar'))
    fireEvent.click(screen.getByText('Sí, eliminar'))
    await new Promise(r => setTimeout(r, 30))

    expect(screen.getByText(/tiene movimientos asociados/)).toBeTruthy()
    // Modal sigue abierto
    expect(screen.queryByText(/no se puede deshacer/i)).toBeTruthy()
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('error 500 sin body → muestra "No se pudo eliminar" como fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 500 })))

    render(<DeleteButton endpoint="/api/cuentas/c1" />)
    fireEvent.click(screen.getByText('Eliminar'))
    fireEvent.click(screen.getByText('Sí, eliminar'))
    await new Promise(r => setTimeout(r, 30))

    expect(screen.getByText(/No se pudo eliminar/)).toBeTruthy()
  })

  it('estado loading: botón "Eliminando…" + disabled mientras carga', async () => {
    let resolveResp: (v: Response) => void
    const pendingResp = new Promise<Response>(r => { resolveResp = r })
    vi.stubGlobal('fetch', vi.fn(() => pendingResp))

    render(<DeleteButton endpoint="/api/cuentas/c1" />)
    fireEvent.click(screen.getByText('Eliminar'))
    const confirmBtn = screen.getByText('Sí, eliminar') as HTMLButtonElement
    fireEvent.click(confirmBtn)

    // En el next tick estamos en loading
    await new Promise(r => setTimeout(r, 5))
    expect(screen.getByText('Eliminando…')).toBeTruthy()
    expect((screen.getByText('Eliminando…') as HTMLButtonElement).disabled).toBe(true)

    // Limpiamos la promesa para no dejar pendiente
    resolveResp!(new Response('{}', { status: 200 }))
  })
})

describe('DeleteButton — copy personalizado', () => {
  it('description custom se muestra en el modal', () => {
    render(<DeleteButton
      endpoint="/api/cuentas/x"
      description="Esta tarjeta tiene 12 movimientos asociados que se conservarán."
    />)
    fireEvent.click(screen.getByText('Eliminar'))
    expect(screen.getByText(/12 movimientos asociados/)).toBeTruthy()
  })

  it('label custom aparece en el título "¿Eliminar X?"', () => {
    render(<DeleteButton endpoint="/api/x" label="la tarjeta Visa Galicia" />)
    fireEvent.click(screen.getByText('Eliminar'))
    expect(screen.getByText('¿Eliminar la tarjeta Visa Galicia?')).toBeTruthy()
  })

  it('label default es "este elemento"', () => {
    render(<DeleteButton endpoint="/api/x" />)
    fireEvent.click(screen.getByText('Eliminar'))
    expect(screen.getByText('¿Eliminar este elemento?')).toBeTruthy()
  })
})
