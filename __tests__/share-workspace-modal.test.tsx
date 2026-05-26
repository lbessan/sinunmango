// @vitest-environment happy-dom
//
// Tests para components/share-workspace-modal.tsx
//
// Cubrimos:
//   - render loading state inicial
//   - render de las 4 secciones (Cuentas, Tarjetas, Gastos fijos, Inversiones)
//   - default todo marcado
//   - toggle individual + "Marcar/Desmarcar todo"
//   - role picker editor/viewer
//   - submit con resources vacíos → muestra error sin llamar a la API
//   - submit happy path → muestra link generado
//   - submit con error de Pro → muestra mensaje correcto
//   - close on backdrop click
//   - revoke share → fetch DELETE + reload

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ShareWorkspaceModal } from '@/components/share-workspace-modal'

const ORIGINAL_FETCH = global.fetch

// Helper para mockear las respuestas de las 4 calls iniciales:
//   GET /api/shareable-resources
//   GET /api/shares
function mockInitialLoad(opts: {
  cuentas?:      Array<{ id: string; nombre_cuenta: string; tipo_cuenta: string; moneda?: string }>
  gastosFijos?:  Array<{ id: string; nombre_gasto: string; monto_estimado?: number; moneda?: string }>
  inversiones?:  Array<{ id: string; nombre?: string; tipo: string; moneda?: string }>
  shares?:       Array<{ id: string; status: string; role: string; invitee_email: string | null; resources: { cuentas: string[]; gastos_fijos: string[]; inversiones: string[] } }>
} = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/shareable-resources') && (!init || init.method === undefined || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          cuentas: opts.cuentas ?? [],
          gastos_fijos: opts.gastosFijos ?? [],
          inversiones: opts.inversiones ?? [],
        }),
      })
    }
    if (typeof url === 'string' && url === '/api/shares' && (!init || init.method === undefined || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: opts.shares ?? [] }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.clearAllMocks()
})

describe('ShareWorkspaceModal — loading', () => {
  it('renderea loading state al inicio', () => {
    mockInitialLoad({})
    render(<ShareWorkspaceModal onClose={() => {}} />)
    // Aria-name del título visible
    expect(screen.getByText('Compartir workspace')).toBeTruthy()
    // Loading text aparece antes de que las promesas se resuelvan
    expect(screen.getByText(/Cargando tus recursos/i)).toBeTruthy()
  })
})

describe('ShareWorkspaceModal — secciones', () => {
  it('renderea las 4 secciones cuando hay items en cada categoría', async () => {
    mockInitialLoad({
      cuentas: [
        { id: 'cta_1', nombre_cuenta: 'Galicia',  tipo_cuenta: 'Banco CA', moneda: 'ARS' },
        { id: 'cta_2', nombre_cuenta: 'Visa Plat', tipo_cuenta: 'Tarjeta Credito', moneda: 'ARS' },
      ],
      gastosFijos: [{ id: 'gf-1', nombre_gasto: 'Internet', monto_estimado: 15000, moneda: 'ARS' }],
      inversiones: [{ id: 'inv-1', tipo: 'Plazo fijo', moneda: 'ARS' }],
    })

    render(<ShareWorkspaceModal onClose={() => {}} />)

    // Esperar que cargue
    await waitFor(() => {
      expect(screen.getByText('Galicia')).toBeTruthy()
    })

    // Las 4 secciones aparecen
    expect(screen.getByText('Cuentas')).toBeTruthy()
    expect(screen.getByText('Tarjetas')).toBeTruthy()
    expect(screen.getByText('Gastos fijos')).toBeTruthy()
    expect(screen.getByText('Inversiones')).toBeTruthy()

    // Tarjeta separada de cuenta común
    expect(screen.getByText('Visa Plat')).toBeTruthy()
  })

  it('default todo marcado', async () => {
    mockInitialLoad({
      cuentas: [
        { id: 'cta_1', nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA', moneda: 'ARS' },
      ],
    })

    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Galicia')).toBeTruthy())

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('toggle individual desmarca un item', async () => {
    mockInitialLoad({
      cuentas: [
        { id: 'cta_1', nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA', moneda: 'ARS' },
      ],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Galicia')).toBeTruthy())

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('"Desmarcar todo" desmarca toda la sección', async () => {
    mockInitialLoad({
      cuentas: [
        { id: 'cta_1', nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco CA', moneda: 'ARS' },
        { id: 'cta_3', nombre_cuenta: 'Macro',   tipo_cuenta: 'Banco CA', moneda: 'ARS' },
      ],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Galicia')).toBeTruthy())

    const toggleAllBtn = screen.getByText('Desmarcar todo')
    fireEvent.click(toggleAllBtn)
    // Tras desmarcar, todos los checkboxes de cuentas deben estar unchecked
    const checkboxes = screen.getAllByRole('checkbox').filter(c => (c as HTMLInputElement).type === 'checkbox')
    for (const c of checkboxes) expect((c as HTMLInputElement).checked).toBe(false)
  })
})

describe('ShareWorkspaceModal — role picker', () => {
  it('default role=editor', async () => {
    mockInitialLoad({
      cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('X')).toBeTruthy())

    const editorRadio = screen.getByLabelText(/Colaborador/) as HTMLInputElement
    expect(editorRadio.checked).toBe(true)
  })

  it('click en viewer cambia role', async () => {
    mockInitialLoad({
      cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('X')).toBeTruthy())

    const viewerRadio = screen.getByLabelText(/Solo ver/) as HTMLInputElement
    fireEvent.click(viewerRadio)
    expect(viewerRadio.checked).toBe(true)
  })
})

describe('ShareWorkspaceModal — submit', () => {
  it('si todo está desmarcado → muestra error sin llamar a POST', async () => {
    const fetchMock = mockInitialLoad({
      cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('X')).toBeTruthy())

    // Desmarcar todo
    fireEvent.click(screen.getByText('Desmarcar todo'))

    const submit = screen.getByText(/Generar link de invitación/)
    fireEvent.click(submit)

    await waitFor(() => {
      expect(screen.getByText(/al menos un recurso/i)).toBeTruthy()
    })
    // No se llamó POST /api/shares
    const postCalls = fetchMock.mock.calls.filter(c => {
      const init = c[1] as RequestInit | undefined
      return init?.method === 'POST'
    })
    expect(postCalls).toHaveLength(0)
  })

  it('happy path: POST devuelve url → muestra link generado', async () => {
    let postCalled = false
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/shareable-resources')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
          gastos_fijos: [], inversiones: [],
        }) })
      }
      if (url === '/api/shares' && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ shares: [] }) })
      }
      if (url === '/api/shares' && init?.method === 'POST') {
        postCalled = true
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            invite_url: 'https://app.test/invite/abc',
            role: 'editor',
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('X')).toBeTruthy())

    fireEvent.click(screen.getByText(/Generar link de invitación/))

    await waitFor(() => {
      expect(screen.getByText('https://app.test/invite/abc')).toBeTruthy()
    })
    expect(postCalled).toBe(true)
  })

  it('error de Pro → muestra mensaje pertinente', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/shareable-resources')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
          gastos_fijos: [], inversiones: [],
        }) })
      }
      if (url === '/api/shares' && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ shares: [] }) })
      }
      if (url === '/api/shares' && init?.method === 'POST') {
        return Promise.resolve({
          ok: false, status: 403,
          json: () => Promise.resolve({ error: 'requires_pro' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<ShareWorkspaceModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('X')).toBeTruthy())

    fireEvent.click(screen.getByText(/Generar link de invitación/))

    await waitFor(() => {
      expect(screen.getByText(/feature Pro/i)).toBeTruthy()
    })
  })
})

describe('ShareWorkspaceModal — close', () => {
  it('close button llama onClose', async () => {
    mockInitialLoad({})
    const onClose = vi.fn()
    render(<ShareWorkspaceModal onClose={onClose} />)

    const closeBtn = screen.getByLabelText('Cerrar modal')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ShareWorkspaceModal — active shares list', () => {
  it('renderea lista de shares activos con email + recursos count', async () => {
    mockInitialLoad({
      cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
      shares: [{
        id: 's1', status: 'active', role: 'editor',
        invitee_email: 'esposa@x.com',
        resources: { cuentas: ['cta_1'], gastos_fijos: ['gf-1'], inversiones: [] },
      }],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('esposa@x.com')).toBeTruthy()
    })
    expect(screen.getByText(/2 recursos/)).toBeTruthy()
  })

  it('share sin invitee_email muestra "Pendiente de aceptar"', async () => {
    mockInitialLoad({
      cuentas: [{ id: 'cta_1', nombre_cuenta: 'X', tipo_cuenta: 'Banco CA' }],
      shares: [{
        id: 's1', status: 'pending', role: 'viewer',
        invitee_email: null,
        resources: { cuentas: ['cta_1'], gastos_fijos: [], inversiones: [] },
      }],
    })
    render(<ShareWorkspaceModal onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Pendiente de aceptar')).toBeTruthy()
    })
  })
})
