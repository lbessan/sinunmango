// @vitest-environment happy-dom
//
// Tests para components/limit-reached-modal.tsx
//
// Regresión del bug que fixeamos antes:
//   - El modal estaba renderando dentro del stacking context del sidebar
//     (que es position: sticky → crea stacking context auto). El <main>
//     hermano pintaba encima y tapaba el título/body/botones. Fix: portal
//     a document.body.
//
// Y validación de:
//   - render por feature (5 copies distintos)
//   - close on click del backdrop
//   - close on click de la X
//   - usage counter visible solo si feature !== 'personalizacion' y limit > 0
//   - Link a /pro tiene onClick={onClose} (regresión: el modal no se cerraba
//     al navegar a /pro porque el sidebar persiste entre páginas)
//   - tryParseLimitReached helper

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LimitReachedModal, tryParseLimitReached, type LimitReachedInfo } from '@/components/limit-reached-modal'

// Mock next/link para que renderee un <a> normal (más simple para test)
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...rest }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
    [k: string]: unknown
  }) => <a href={href} onClick={onClick} {...rest}>{children}</a>,
}))

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('LimitReachedModal — rendering', () => {
  it('info=null → no renderea nada', () => {
    const { container } = render(<LimitReachedModal info={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
    // No hay modal content en el portal a body (sí está el container de
    // RTL pero está vacío)
    expect(document.body.querySelector('.rounded-2xl')).toBeNull()
  })

  it('feature=asistente → título "Llegaste al límite del asistente" + body + counter', () => {
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={() => {}}
    />)
    expect(screen.getByText('Llegaste al límite del asistente')).toBeTruthy()
    expect(screen.getByText(/Pasate a Pro y charlá con Manguito sin límites/)).toBeTruthy()
    expect(screen.getByText('Usaste 5 de 5 este mes')).toBeTruthy()
  })

  it('feature=ticket → copy correcto', () => {
    render(<LimitReachedModal
      info={{ feature: 'ticket', limit: 3, used: 3 }}
      onClose={() => {}}
    />)
    expect(screen.getByText('Llegaste al límite de tickets del mes')).toBeTruthy()
  })

  it('feature=resumen → copy correcto', () => {
    render(<LimitReachedModal
      info={{ feature: 'resumen', limit: 1, used: 1 }}
      onClose={() => {}}
    />)
    expect(screen.getByText('Llegaste al límite de resúmenes del mes')).toBeTruthy()
  })

  it('feature=mail_tarjeta → copy correcto', () => {
    render(<LimitReachedModal
      info={{ feature: 'mail_tarjeta', limit: 50, used: 50 }}
      onClose={() => {}}
    />)
    expect(screen.getByText('Llegaste al límite de mails parseados')).toBeTruthy()
  })

  it('feature=personalizacion → título "La personalización es Pro" + NO muestra counter', () => {
    render(<LimitReachedModal
      info={{ feature: 'personalizacion', limit: -1, used: 0 }}
      onClose={() => {}}
    />)
    expect(screen.getByText('La personalización es Pro')).toBeTruthy()
    expect(screen.queryByText(/Usaste/)).toBeNull()  // no se muestra el counter
  })

  it('counter no aparece si limit <= 0 (ej. -1)', () => {
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: -1, used: 0 }}
      onClose={() => {}}
    />)
    expect(screen.queryByText(/Usaste/)).toBeNull()
  })

  it('renderea ambos botones: "Más tarde" y "Ver Plan Pro"', () => {
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={() => {}}
    />)
    expect(screen.getByText('Más tarde')).toBeTruthy()
    expect(screen.getByText('Ver Plan Pro')).toBeTruthy()
  })

  it('"Ver Plan Pro" linkea a /pro', () => {
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={() => {}}
    />)
    const link = screen.getByText('Ver Plan Pro').closest('a')!
    expect(link.getAttribute('href')).toBe('/pro')
  })
})

describe('LimitReachedModal — portal a document.body (regresión)', () => {
  it('el modal se monta directamente en document.body, no como hijo del container', () => {
    const { container } = render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={() => {}}
    />)
    // El container retornado por render() está vacío — el modal fue portaled
    expect(container.firstChild).toBeNull()
    // El modal está en document.body
    const titleEl = screen.getByText('Llegaste al límite del asistente')
    // El path al root debe ir directo a document.body, sin pasar por el container
    let current: HTMLElement | null = titleEl
    let foundBody = false
    while (current) {
      if (current === document.body) { foundBody = true; break }
      current = current.parentElement
    }
    expect(foundBody).toBe(true)
  })
})

describe('LimitReachedModal — interacciones', () => {
  it('click en el backdrop → llama onClose', () => {
    const onClose = vi.fn()
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={onClose}
    />)
    // El backdrop es el div con fixed inset-0 z-50 — el ancestor del card
    const card = screen.getByText('Llegaste al límite del asistente').closest('.rounded-2xl')!
    const backdrop = card.parentElement!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click en el card NO llama onClose (stopPropagation)', () => {
    const onClose = vi.fn()
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={onClose}
    />)
    const card = screen.getByText('Llegaste al límite del asistente').closest('.rounded-2xl')!
    fireEvent.click(card)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('click en "Más tarde" → llama onClose', () => {
    const onClose = vi.fn()
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={onClose}
    />)
    fireEvent.click(screen.getByText('Más tarde'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click en "Ver Plan Pro" → llama onClose (regresión: el sidebar persiste entre páginas)', () => {
    const onClose = vi.fn()
    render(<LimitReachedModal
      info={{ feature: 'asistente', limit: 5, used: 5 }}
      onClose={onClose}
    />)
    fireEvent.click(screen.getByText('Ver Plan Pro'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ── tryParseLimitReached helper ────────────────────────────────────────────
describe('tryParseLimitReached', () => {
  function fakeResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status })
  }

  it('status !== 429 → null', async () => {
    const r = await tryParseLimitReached(fakeResponse(200, { error: 'limit_reached', feature: 'asistente' }))
    expect(r).toBeNull()
  })

  it('429 con error="limit_reached" + feature → devuelve LimitReachedInfo', async () => {
    const r = await tryParseLimitReached(fakeResponse(429, {
      error: 'limit_reached', feature: 'asistente', limit: 5, used: 5,
    }))
    expect(r).toEqual({ feature: 'asistente', limit: 5, used: 5 })
  })

  it('429 sin error="limit_reached" → null (otro tipo de 429)', async () => {
    const r = await tryParseLimitReached(fakeResponse(429, { error: 'rate_limited' }))
    expect(r).toBeNull()
  })

  it('429 con error correcto pero sin feature → null', async () => {
    const r = await tryParseLimitReached(fakeResponse(429, { error: 'limit_reached' }))
    expect(r).toBeNull()
  })

  it('429 con body que no es JSON → null', async () => {
    const r = await tryParseLimitReached(new Response('not json', { status: 429 }))
    expect(r).toBeNull()
  })

  it('feature presente pero limit/used ausentes → defaults a 0', async () => {
    const r = await tryParseLimitReached(fakeResponse(429, {
      error: 'limit_reached', feature: 'ticket',
    })) as LimitReachedInfo
    expect(r.limit).toBe(0)
    expect(r.used).toBe(0)
  })
})
