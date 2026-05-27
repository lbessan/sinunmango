// @vitest-environment happy-dom
//
// Tests para components/sidebar-usage-widget.tsx
//
// Widget que muestra cupos del free user. Si es Pro, badge discreto.
// Hace fetch a /api/me. Revalida en focus + custom event 'usage:changed'.
//
// Cubrimos:
//   - mientras carga → no renderea nada
//   - Pro → badge "Plan Pro activo" sin counters
//   - Free → counters por feature + CTA "Probá Pro"
//   - feature con remaining=0 → color amber
//   - listener 'usage:changed' refetch
//   - listener 'focus' refetch

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import { SidebarUsageWidget } from '@/components/sidebar-usage-widget'

const ORIGINAL_FETCH = global.fetch

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
    <a href={href} {...rest}>{children}</a>,
}))

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.clearAllMocks()
})

describe('SidebarUsageWidget', () => {
  it('mientras carga (sin data) → no renderea', () => {
    // Promise pending → data nunca llega
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
    const { container } = render(<SidebarUsageWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('Pro user → renderea badge "Plan Pro activo"', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access: true, plan: 'pro', usage: null,
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      expect(screen.getByText('Plan Pro activo')).toBeTruthy()
    })
    expect(screen.getByText('Sin límites')).toBeTruthy()
    // No tiene CTA de Pro upgrade
    expect(screen.queryByText(/Probá Pro/)).toBeNull()
  })

  it('grandfathered → también badge "Plan Pro activo"', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access: true, plan: 'grandfathered', usage: null,
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      expect(screen.getByText('Plan Pro activo')).toBeTruthy()
    })
  })

  it('Free user → renderea counters + CTA', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access: false, plan: 'free',
        usage: {
          asistente:    { used: 2, limit: 5, remaining: 3 },
          ticket:       { used: 0, limit: 3, remaining: 3 },
          resumen:      { used: 1, limit: 1, remaining: 0 },
          mail_tarjeta: { used: 0, limit: 1, remaining: 1 },
        },
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      expect(screen.getByText('Tus cupos del mes')).toBeTruthy()
    })

    // 4 labels
    expect(screen.getByText('Asistente')).toBeTruthy()
    expect(screen.getByText('Tickets')).toBeTruthy()
    expect(screen.getByText('Resúmenes')).toBeTruthy()
    expect(screen.getByText('Mails')).toBeTruthy()

    // Counters
    expect(screen.getByText('2 / 5')).toBeTruthy()
    expect(screen.getByText('0 / 3')).toBeTruthy()
    expect(screen.getByText('1 / 1')).toBeTruthy()
    expect(screen.getByText('0 / 1')).toBeTruthy()

    // CTA
    expect(screen.getByText(/Probá Pro 7 días gratis/)).toBeTruthy()
  })

  it('feature con remaining=0 → color amber (clase amber-400)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access: false, plan: 'free',
        usage: {
          asistente:    { used: 5, limit: 5, remaining: 0 },
          ticket:       { used: 0, limit: 3, remaining: 3 },
          resumen:      { used: 0, limit: 1, remaining: 1 },
          mail_tarjeta: { used: 0, limit: 1, remaining: 1 },
        },
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      const counter = screen.getByText('5 / 5')
      expect(counter.className).toMatch(/amber-400/)
    })
  })

  it("evento 'usage:changed' dispara refetch", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access: false, plan: 'free',
        usage: {
          asistente:    { used: 0, limit: 5, remaining: 5 },
          ticket:       { used: 0, limit: 3, remaining: 3 },
          resumen:      { used: 0, limit: 1, remaining: 1 },
          mail_tarjeta: { used: 0, limit: 1, remaining: 1 },
        },
      }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    // Dispara el evento
    act(() => {
      window.dispatchEvent(new Event('usage:changed'))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it("evento 'focus' dispara refetch", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access: true, plan: 'pro', usage: null,
      }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('fetch falla → no renderea nada (silent)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('boom'))) as unknown as typeof fetch

    const { container } = render(<SidebarUsageWidget />)
    // Esperar microtasks
    await new Promise(r => setTimeout(r, 30))
    expect(container.firstChild).toBeNull()
  })

  it('fetch no-ok → no renderea (data sigue null)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch

    const { container } = render(<SidebarUsageWidget />)
    await new Promise(r => setTimeout(r, 30))
    expect(container.firstChild).toBeNull()
  })

  it('Pro vía workspace ajeno → badge "Pro vía <owner>" + subtítulo "En este workspace"', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access:   true,
        plan:             'pro',
        plan_source:      'workspace_share',
        plan_owner_email: 'owner@example.com',
        usage:            null,
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      // Usa local-part del email para el badge
      expect(screen.getByText('Pro vía owner')).toBeTruthy()
    })
    expect(screen.getByText('En este workspace')).toBeTruthy()
    // No muestra "Plan Pro activo" cuando es vía share
    expect(screen.queryByText('Plan Pro activo')).toBeNull()
  })

  it('Pro propio (plan_source=own) → badge "Plan Pro activo" (no menciona share)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access:   true,
        plan:             'pro',
        plan_source:      'own',
        plan_owner_email: null,
        usage:            null,
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      expect(screen.getByText('Plan Pro activo')).toBeTruthy()
    })
    expect(screen.queryByText(/Pro vía/)).toBeNull()
  })

  it('Pro vía share SIN owner_email → fallback "Pro vía workspace compartido"', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        has_pro_access:   true,
        plan:             'pro',
        plan_source:      'workspace_share',
        plan_owner_email: null,
        usage:            null,
      }),
    })) as unknown as typeof fetch

    render(<SidebarUsageWidget />)
    await waitFor(() => {
      expect(screen.getByText('Pro vía workspace compartido')).toBeTruthy()
    })
  })
})
