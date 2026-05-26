// @vitest-environment happy-dom
//
// Tests para components/workspace-switcher.tsx
//
// Cubrimos:
//   - No renderea si solo hay 1 workspace (no shares recibidos)
//   - No renderea si la API falla
//   - Renderea con current visible + dropdown cerrado
//   - Click abre dropdown
//   - Switch a otro workspace llama API + reload
//   - Click en current no llama API

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'

const ORIGINAL_FETCH    = global.fetch
const ORIGINAL_LOCATION = window.location

const ME    = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'

function mockApi(data: unknown, ok = true) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/workspace' && (!init || init.method === undefined)) {
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(data),
      })
    }
    if (typeof url === 'string' && url === '/api/workspace/switch' && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.clearAllMocks()
  // Restore location
  Object.defineProperty(window, 'location', { value: ORIGINAL_LOCATION, writable: true })
})

describe('WorkspaceSwitcher — no renderiza', () => {
  it('solo 1 workspace (own) → no se monta nada', async () => {
    mockApi({
      current:    { ownerUserId: ME, isOwn: true, ownerEmail: 'me@x.com', role: null },
      workspaces: [{ ownerUserId: ME, ownerEmail: 'me@x.com', isOwn: true }],
    })

    const { container } = render(<WorkspaceSwitcher />)
    await waitFor(() => {
      expect(container.querySelector('button')).toBeNull()
    })
  })

  it('API falla → no se renderea', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network'))) as unknown as typeof fetch

    const { container } = render(<WorkspaceSwitcher />)
    // Esperar microtasks
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('WorkspaceSwitcher — renderiza', () => {
  it('con 2+ workspaces → muestra current (Mi cuenta) por default', async () => {
    mockApi({
      current:    { ownerUserId: ME, isOwn: true, ownerEmail: 'me@x.com', role: null },
      workspaces: [
        { ownerUserId: ME,    ownerEmail: 'me@x.com',    isOwn: true  },
        { ownerUserId: OWNER, ownerEmail: 'owner@x.com', isOwn: false },
      ],
    })

    render(<WorkspaceSwitcher />)
    await waitFor(() => {
      expect(screen.getAllByText('Mi cuenta').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Workspace')).toBeTruthy()
  })

  it('cuando current es guest, muestra el nombre del owner', async () => {
    mockApi({
      current:    { ownerUserId: OWNER, isOwn: false, ownerEmail: 'owner@x.com', role: 'viewer' },
      workspaces: [
        { ownerUserId: ME,    ownerEmail: 'me@x.com',    isOwn: true  },
        { ownerUserId: OWNER, ownerEmail: 'owner@x.com', isOwn: false },
      ],
    })

    render(<WorkspaceSwitcher />)
    // El display name es el local-part del email (antes del @)
    await waitFor(() => {
      expect(screen.getByText('owner')).toBeTruthy()
    })
  })

  it('click abre dropdown, muestra ambos workspaces', async () => {
    mockApi({
      current:    { ownerUserId: ME, isOwn: true, ownerEmail: 'me@x.com', role: null },
      workspaces: [
        { ownerUserId: ME,    ownerEmail: 'me@x.com',    isOwn: true  },
        { ownerUserId: OWNER, ownerEmail: 'owner@x.com', isOwn: false },
      ],
    })

    render(<WorkspaceSwitcher />)
    await waitFor(() => {
      expect(screen.getAllByText('Mi cuenta').length).toBeGreaterThan(0)
    })

    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)

    // Dropdown abierto → aparece 'owner@x.com' (el item)
    await waitFor(() => {
      expect(screen.getByText('owner@x.com')).toBeTruthy()
    })
  })
})

describe('WorkspaceSwitcher — switch', () => {
  it('switch a otro workspace → POST switch + reload', async () => {
    // Mock reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...ORIGINAL_LOCATION, reload: reloadMock },
      writable: true,
    })

    let switchCalled = false
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/workspace' && (!init || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            current:    { ownerUserId: ME, isOwn: true, ownerEmail: 'me@x.com', role: null },
            workspaces: [
              { ownerUserId: ME,    ownerEmail: 'me@x.com',    isOwn: true  },
              { ownerUserId: OWNER, ownerEmail: 'owner@x.com', isOwn: false },
            ],
          }),
        })
      }
      if (url === '/api/workspace/switch' && init?.method === 'POST') {
        switchCalled = true
        // Validamos el body
        const body = JSON.parse(init.body as string)
        expect(body.workspace_id).toBe(OWNER)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<WorkspaceSwitcher />)
    await waitFor(() => {
      expect(screen.getAllByText('Mi cuenta').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText('owner@x.com')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('owner@x.com'))
    })

    await waitFor(() => {
      expect(switchCalled).toBe(true)
      expect(reloadMock).toHaveBeenCalled()
    })
  })

  it('click en current item no dispara switch', async () => {
    let switchCalled = false
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/workspace' && (!init || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            current:    { ownerUserId: ME, isOwn: true, ownerEmail: 'me@x.com', role: null },
            workspaces: [
              { ownerUserId: ME,    ownerEmail: 'me@x.com',    isOwn: true  },
              { ownerUserId: OWNER, ownerEmail: 'owner@x.com', isOwn: false },
            ],
          }),
        })
      }
      if (url === '/api/workspace/switch' && init?.method === 'POST') {
        switchCalled = true
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<WorkspaceSwitcher />)
    await waitFor(() => {
      expect(screen.getAllByText('Mi cuenta').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getByRole('button'))

    // El dropdown ahora tiene 2 instancias de "Mi cuenta" (header + item).
    // Click en el item (segundo "Mi cuenta") no debería disparar switch porque es current.
    const items = screen.getAllByText('Mi cuenta')
    const dropdownItem = items[items.length - 1]
    fireEvent.click(dropdownItem)

    // Pequeño wait para asegurar que nada async pase
    await new Promise(r => setTimeout(r, 30))
    expect(switchCalled).toBe(false)
  })
})
