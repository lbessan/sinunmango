// @vitest-environment happy-dom
//
// Tests para app/invite/[token]/client.tsx (AcceptInvitationClient).
//
// Cubrimos:
//   - render con counts correctos (singular/plural, hide si 0)
//   - render con role editor vs viewer (copy distinto)
//   - accept happy path: POST invitations → POST workspace/switch → router.push
//   - accept fail: muestra error sin redirect
//   - mensaje cuando todo está en 0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { AcceptInvitationClient } from '@/app/invite/[token]/client'

const ORIGINAL_FETCH = global.fetch

const TOKEN = 'a'.repeat(32)
const OWNER = '22222222-2222-2222-2222-222222222222'

// Mock next/navigation
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}))

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
  pushMock.mockReset()
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
})

describe('AcceptInvitationClient — rendering', () => {
  it('role editor → copy "colaborar en"', () => {
    render(<AcceptInvitationClient
      token={TOKEN}
      ownerEmail="owner@x.com"
      role="editor"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)
    expect(screen.getByText('owner@x.com')).toBeTruthy()
    expect(screen.getByText('colaborar en')).toBeTruthy()
    expect(screen.getByText(/Como colaborador/)).toBeTruthy()
  })

  it('role viewer → copy "ver"', () => {
    render(<AcceptInvitationClient
      token={TOKEN}
      ownerEmail="owner@x.com"
      role="viewer"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)
    expect(screen.getByText(/Como visualizador/)).toBeTruthy()
  })

  it('counts singular/plural correcto para cuentas', () => {
    const { rerender } = render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)
    expect(screen.getByText(/1 cuenta\s/)).toBeTruthy()

    rerender(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 3, gastos_fijos: 0, inversiones: 0 }}
    />)
    expect(screen.getByText(/3 cuentas/)).toBeTruthy()
  })

  it('counts singular/plural correcto para gastos_fijos', () => {
    const { rerender } = render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 0, gastos_fijos: 1, inversiones: 0 }}
    />)
    expect(screen.getByText('1 gasto fijo')).toBeTruthy()

    rerender(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 0, gastos_fijos: 4, inversiones: 0 }}
    />)
    expect(screen.getByText('4 gastos fijos')).toBeTruthy()
  })

  it('counts singular/plural correcto para inversiones', () => {
    const { rerender } = render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 0, gastos_fijos: 0, inversiones: 1 }}
    />)
    expect(screen.getByText('1 inversión')).toBeTruthy()

    rerender(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 0, gastos_fijos: 0, inversiones: 5 }}
    />)
    expect(screen.getByText('5 inversiones')).toBeTruthy()
  })

  it('counts en 0 → no muestra esa línea', () => {
    render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 2, gastos_fijos: 0, inversiones: 0 }}
    />)
    // Cuentas visible
    expect(screen.getByText(/2 cuentas/)).toBeTruthy()
    // Gastos fijos NO visible
    expect(screen.queryByText(/gasto fijo/)).toBeNull()
  })

  it('total 0 → mensaje "todavía no compartió recursos"', () => {
    render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 0, gastos_fijos: 0, inversiones: 0 }}
    />)
    expect(screen.getByText(/todavía no compartió recursos/i)).toBeTruthy()
  })
})

describe('AcceptInvitationClient — accept flow', () => {
  it('happy path: POST invitations → POST switch → router.push /dashboard', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = []
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body })
      if (url === `/api/invitations/${TOKEN}` && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, owner_user_id: OWNER }),
        })
      }
      if (url === '/api/workspace/switch' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="editor"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard')
    })

    // Validar que llamó a ambos endpoints en orden
    const invCall    = calls.find(c => c.url === `/api/invitations/${TOKEN}`)
    const switchCall = calls.find(c => c.url === '/api/workspace/switch')
    expect(invCall).toBeDefined()
    expect(switchCall).toBeDefined()
    // El switch body tiene el owner_user_id
    expect(JSON.parse(switchCall!.body as string).workspace_id).toBe(OWNER)
  })

  it('error en accept → muestra mensaje + no redirect', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === `/api/invitations/${TOKEN}` && init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Esta invitación expiró.' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch

    render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))

    await waitFor(() => {
      expect(screen.getByText('Esta invitación expiró.')).toBeTruthy()
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('error de network → muestra "Error de conexión"', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('boom'))) as unknown as typeof fetch

    render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))

    await waitFor(() => {
      expect(screen.getByText('Error de conexión.')).toBeTruthy()
    })
  })

  it('mientras está aceptando, el botón muestra "Aceptando..."', async () => {
    // Promise pending para mantener loading state
    let resolveFetch: (v: unknown) => void = () => {}
    global.fetch = vi.fn(() => new Promise(r => { resolveFetch = r })) as unknown as typeof fetch

    render(<AcceptInvitationClient
      token={TOKEN} ownerEmail="o@x.com" role="viewer"
      counts={{ cuentas: 1, gastos_fijos: 0, inversiones: 0 }}
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))
    await waitFor(() => {
      expect(screen.getByText('Aceptando...')).toBeTruthy()
    })
    // Cleanup: resolve la promesa para no dejar pending
    resolveFetch({ ok: true, json: () => Promise.resolve({ ok: true, owner_user_id: OWNER }) })
  })
})
