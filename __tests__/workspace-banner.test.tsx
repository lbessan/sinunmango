// @vitest-environment happy-dom
//
// Tests para components/workspace-banner.tsx
//
// Cubre:
//   - render con role editor → ícono Pencil + copy
//   - render con role viewer → ícono Eye + copy "solo lectura"
//   - ownerEmail null → muestra fallback "otro usuario"
//   - click "Volver al mío" → POST switch con myUserId + redirect a /dashboard
//   - error de POST → no redirect, vuelve a estado normal

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { WorkspaceBanner } from '@/components/workspace-banner'

const ORIGINAL_FETCH    = global.fetch
const ORIGINAL_LOCATION = window.location

const MY_USER_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  Object.defineProperty(window, 'location', { value: ORIGINAL_LOCATION, writable: true })
  vi.clearAllMocks()
})

describe('WorkspaceBanner — rendering', () => {
  it('role editor → muestra "podés cargar movimientos"', () => {
    render(<WorkspaceBanner ownerEmail="owner@x.com" role="editor" myUserId={MY_USER_ID} />)
    expect(screen.getByText('owner@x.com')).toBeTruthy()
    expect(screen.getByText(/podés cargar movimientos/i)).toBeTruthy()
  })

  it('role viewer → muestra "solo lectura"', () => {
    render(<WorkspaceBanner ownerEmail="owner@x.com" role="viewer" myUserId={MY_USER_ID} />)
    expect(screen.getByText(/solo lectura/i)).toBeTruthy()
  })

  it('ownerEmail null → muestra "otro usuario"', () => {
    render(<WorkspaceBanner ownerEmail={null} role="viewer" myUserId={MY_USER_ID} />)
    expect(screen.getByText('otro usuario')).toBeTruthy()
  })

  it('tiene data-testid="workspace-banner"', () => {
    render(<WorkspaceBanner ownerEmail="o@x.com" role="editor" myUserId={MY_USER_ID} />)
    expect(screen.getByTestId('workspace-banner')).toBeTruthy()
  })

  it('botón "Volver al mío" visible', () => {
    render(<WorkspaceBanner ownerEmail="o@x.com" role="editor" myUserId={MY_USER_ID} />)
    expect(screen.getByText('Volver al mío')).toBeTruthy()
  })
})

describe('WorkspaceBanner — return flow', () => {
  it('click "Volver al mío" → POST switch con myUserId + redirige a /dashboard', async () => {
    // Mock window.location
    const hrefSetter = vi.fn()
    Object.defineProperty(window, 'location', {
      value: new Proxy({} as Location, {
        set: (_t, prop, value) => {
          if (prop === 'href') hrefSetter(value)
          return true
        },
        get: (_t, prop) => prop === 'href' ? '' : ORIGINAL_LOCATION[prop as keyof Location],
      }),
      writable: true,
    })

    let switchCalled = false
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/workspace/switch' && init?.method === 'POST') {
        switchCalled = true
        const body = JSON.parse(init.body as string)
        expect(body.workspace_id).toBe(MY_USER_ID)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<WorkspaceBanner ownerEmail="o@x.com" role="editor" myUserId={MY_USER_ID} />)
    fireEvent.click(screen.getByText('Volver al mío'))

    await waitFor(() => {
      expect(switchCalled).toBe(true)
      expect(hrefSetter).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('mientras está volviendo, muestra "Volviendo..."', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    global.fetch = vi.fn(() => new Promise(r => { resolveFetch = r })) as unknown as typeof fetch

    render(<WorkspaceBanner ownerEmail="o@x.com" role="editor" myUserId={MY_USER_ID} />)
    fireEvent.click(screen.getByText('Volver al mío'))

    await waitFor(() => {
      expect(screen.getByText('Volviendo...')).toBeTruthy()
    })
    resolveFetch({ ok: true, json: () => Promise.resolve({ ok: true }) })
  })

  it('error en POST → no redirige, botón vuelve a estado normal', async () => {
    const hrefSetter = vi.fn()
    Object.defineProperty(window, 'location', {
      value: new Proxy({} as Location, {
        set: (_t, prop, value) => {
          if (prop === 'href') hrefSetter(value)
          return true
        },
        get: () => '',
      }),
      writable: true,
    })

    global.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'forbidden' }),
    })) as unknown as typeof fetch

    render(<WorkspaceBanner ownerEmail="o@x.com" role="editor" myUserId={MY_USER_ID} />)
    fireEvent.click(screen.getByText('Volver al mío'))

    await waitFor(() => {
      expect(screen.getByText('Volver al mío')).toBeTruthy()
    })
    expect(hrefSetter).not.toHaveBeenCalled()
  })

  it('error de network → no tira ni redirige', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('boom'))) as unknown as typeof fetch

    render(<WorkspaceBanner ownerEmail="o@x.com" role="editor" myUserId={MY_USER_ID} />)
    fireEvent.click(screen.getByText('Volver al mío'))

    // No tira excepción, vuelve a estado normal
    await waitFor(() => {
      expect(screen.getByText('Volver al mío')).toBeTruthy()
    })
  })
})
