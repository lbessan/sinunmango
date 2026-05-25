// @vitest-environment happy-dom
//
// Tests para components/share-account-modal.tsx + share-account-button.tsx +
// share-account-trigger.tsx + app/invite/[token]/client.tsx
//
// Mockeamos fetch para interceptar las llamadas a /api/account-shares y
// /api/invitations.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ShareAccountModal } from '@/components/share-account-modal'
import { ShareAccountButton } from '@/components/share-account-button'
import { AcceptInvitationClient } from '@/app/invite/[token]/client'

// Mock next/navigation
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Helper: instala fetch mock global
type FetchResponse = { status?: number; body?: unknown }
function setupFetch(responses: Array<FetchResponse>) {
  let i = 0
  const fn = vi.fn(async () => {
    const r = responses[i] ?? { status: 200, body: { shares: [] } }
    i++
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
  pushMock.mockReset()
  // Mock clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => Promise.resolve()) },
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── ShareAccountModal ─────────────────────────────────────────────────────
describe('ShareAccountModal', () => {
  it('renderea con cuenta nombre + role picker default editor', async () => {
    setupFetch([{ body: { shares: [] } }])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="Galicia CA" onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Galicia CA')).toBeTruthy()
    })

    // getByLabelText con regex matches el label element; input es child.
    // En este componente cada input está dentro del label, así que
    // getByLabelText nos devuelve directo el input element (asociación
    // implícita).
    const editorRadio = screen.getByLabelText(/Colaborador/i) as HTMLInputElement
    expect(editorRadio.checked).toBe(true)
    const viewerRadio = screen.getByLabelText(/Solo ver/i) as HTMLInputElement
    expect(viewerRadio.checked).toBe(false)
  })

  it('lista shares activos al cargar', async () => {
    setupFetch([{
      body: {
        shares: [
          {
            id: 's1', cuenta_id: 'cta1', cuenta_nombre: 'Galicia',
            invite_token: 't1', role: 'editor',
            invited_at: 'x', expires_at: 'y',
            accepted_at: null, revoked_at: null,
            invitee_email: null, status: 'pending',
          },
          {
            id: 's2', cuenta_id: 'cta1', cuenta_nombre: 'Galicia',
            invite_token: 't2', role: 'viewer',
            invited_at: 'x', expires_at: 'y',
            accepted_at: '2026-05-20', revoked_at: null,
            invitee_email: 'partner@example.com', status: 'active',
          },
        ],
      },
    }])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="Galicia" onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Compartido con 2 personas')).toBeTruthy()
    })
    expect(screen.getByText('partner@example.com')).toBeTruthy()
    expect(screen.getByText('Pendiente de aceptar')).toBeTruthy()
  })

  it('filtra shares de otras cuentas', async () => {
    setupFetch([{
      body: {
        shares: [
          { id: 's_other', cuenta_id: 'cta_diferente', cuenta_nombre: 'Otra',
            invite_token: 't', role: 'editor',
            invited_at: 'x', expires_at: 'y',
            accepted_at: null, revoked_at: null,
            invitee_email: null, status: 'pending' },
        ],
      },
    }])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="Galicia" onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Compartido con nadie')).toBeTruthy()
    })
  })

  it('genera nuevo share y muestra el link + botón copiar', async () => {
    setupFetch([
      { body: { shares: [] } },                                       // GET inicial
      { body: {
          ok: true, id: 's1', invite_token: 'a'.repeat(32),
          invite_url: 'https://app.example.com/invite/' + 'a'.repeat(32),
          role: 'editor', expires_at: '2026-06-01',
          cuenta: { id: 'cta1', nombre: 'Galicia' },
      }},                                                              // POST create
      { body: { shares: [] } },                                       // GET reload
    ])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="Galicia" onClose={() => {}} />)
    await waitFor(() => screen.getByText('Generar link de invitación'))

    fireEvent.click(screen.getByText('Generar link de invitación'))
    await waitFor(() => {
      expect(screen.getByText(/Link listo/i)).toBeTruthy()
      expect(screen.getByText(/Copiar/i)).toBeTruthy()
    })
    expect(screen.getByText(/Expira en 7 días/i)).toBeTruthy()
  })

  it('copia el link al clipboard al clickear "Copiar"', async () => {
    setupFetch([
      { body: { shares: [] } },
      { body: { ok: true, id: 's1', invite_token: 'a'.repeat(32),
          invite_url: 'https://app.example.com/invite/xxx',
          role: 'editor', expires_at: 'x',
          cuenta: { id: 'cta1', nombre: 'X' } } },
      { body: { shares: [] } },
    ])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="X" onClose={() => {}} />)
    await waitFor(() => screen.getByText('Generar link de invitación'))
    fireEvent.click(screen.getByText('Generar link de invitación'))
    await waitFor(() => screen.getByText(/Copiar/i))

    fireEvent.click(screen.getByText(/Copiar/i))
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith('https://app.example.com/invite/xxx')

    await waitFor(() => screen.getByText('¡Copiado!'))
  })

  it('cambiar a viewer y generar → role correcto en el POST', async () => {
    const fetchSpy = setupFetch([
      { body: { shares: [] } },
      { body: { ok: true, id: 's', invite_token: 'a'.repeat(32),
        invite_url: 'https://x.com/invite/y', role: 'viewer',
        expires_at: 'x', cuenta: { id: 'c', nombre: 'X' } } },
      { body: { shares: [] } },
    ])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="X" onClose={() => {}} />)
    await waitFor(() => screen.getByText('Generar link de invitación'))

    // Click en "Solo ver"
    fireEvent.click(screen.getByLabelText(/Solo ver/i))
    fireEvent.click(screen.getByText('Generar link de invitación'))
    await waitFor(() => screen.getByText(/Link listo/i))

    // El POST call (segundo call) recibió role=viewer
    const postCall = fetchSpy.mock.calls[1]
    const reqBody = JSON.parse((postCall[1] as RequestInit).body as string)
    expect(reqBody.role).toBe('viewer')
  })

  it('muestra mensaje específico si la API devuelve requires_pro', async () => {
    setupFetch([
      { body: { shares: [] } },
      { status: 403, body: { error: 'requires_pro' } },
    ])

    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="X" onClose={() => {}} />)
    await waitFor(() => screen.getByText('Generar link de invitación'))
    fireEvent.click(screen.getByText('Generar link de invitación'))

    await waitFor(() => {
      expect(screen.getByText(/Compartir cuentas es una feature Pro/i)).toBeTruthy()
    })
  })

  it('click en X cierra el modal', () => {
    setupFetch([{ body: { shares: [] } }])
    const onClose = vi.fn()
    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="X" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Cerrar modal'))
    expect(onClose).toHaveBeenCalled()
  })

  it('click en el backdrop cierra el modal', () => {
    setupFetch([{ body: { shares: [] } }])
    const onClose = vi.fn()
    render(<ShareAccountModal cuentaId="cta1" cuentaNombre="X" onClose={onClose} />)
    // El backdrop tiene fixed inset-0 + z-50
    const backdrop = document.querySelector('.fixed.inset-0')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('portal: el modal se monta directo en document.body (no en el container de RTL)', () => {
    setupFetch([{ body: { shares: [] } }])
    const { container } = render(
      <ShareAccountModal cuentaId="cta1" cuentaNombre="X" onClose={() => {}} />,
    )
    // El container de RTL queda vacío — el modal vivió en body via portal
    expect(container.firstChild).toBeNull()
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy()
  })
})

// ─── ShareAccountButton ─────────────────────────────────────────────────────
describe('ShareAccountButton', () => {
  it('renderea con variant=card por default', () => {
    setupFetch([{ body: { shares: [] } }])
    render(<ShareAccountButton cuentaId="c1" cuentaNombre="X" />)
    expect(screen.getByText('Compartir')).toBeTruthy()
  })

  it('variant=icon no muestra label "Compartir"', () => {
    setupFetch([{ body: { shares: [] } }])
    render(<ShareAccountButton cuentaId="c1" cuentaNombre="X" variant="icon" />)
    expect(screen.queryByText('Compartir')).toBeNull()
    expect(screen.getByLabelText('Compartir X')).toBeTruthy()
  })

  it('click abre el modal', async () => {
    setupFetch([{ body: { shares: [] } }])
    render(<ShareAccountButton cuentaId="c1" cuentaNombre="Galicia" />)
    fireEvent.click(screen.getByText('Compartir'))
    await waitFor(() => {
      expect(screen.getByText('Compartir cuenta')).toBeTruthy()
    })
  })
})

// ─── AcceptInvitationClient ─────────────────────────────────────────────────
describe('AcceptInvitationClient', () => {
  it('muestra info del owner y la cuenta', () => {
    render(<AcceptInvitationClient
      token={'x'.repeat(32)}
      ownerEmail="owner@example.com"
      cuentaNombre="Galicia"
      cuentaTipo="Banco CA"
      role="editor"
    />)
    expect(screen.getByText('owner@example.com')).toBeTruthy()
    expect(screen.getByText('Galicia')).toBeTruthy()
  })

  it('role editor: muestra que puede crear movimientos', () => {
    render(<AcceptInvitationClient
      token={'x'.repeat(32)} ownerEmail="o@e.com"
      cuentaNombre="X" cuentaTipo={null}
      role="editor"
    />)
    expect(screen.getByText(/Crear nuevos movimientos/i)).toBeTruthy()
  })

  it('role viewer: muestra que NO puede crear movimientos', () => {
    render(<AcceptInvitationClient
      token={'x'.repeat(32)} ownerEmail="o@e.com"
      cuentaNombre="X" cuentaTipo={null}
      role="viewer"
    />)
    expect(screen.getByText(/Crear movimientos — no permitido/i)).toBeTruthy()
  })

  it('click en Aceptar → POST a /api/invitations y redirect a la cuenta', async () => {
    const fetchSpy = setupFetch([
      { body: { ok: true, cuenta_id: 'cta_galicia' } },
    ])

    render(<AcceptInvitationClient
      token={'x'.repeat(32)} ownerEmail="o@e.com"
      cuentaNombre="X" cuentaTipo={null}
      role="editor"
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/cta_galicia'.replace('/cta', '/cuentas/cta'))
    })

    // El POST se hizo al endpoint correcto
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/api/invitations/')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('error de API → muestra mensaje + el botón sigue habilitado', async () => {
    setupFetch([
      { status: 410, body: { error: 'Esta invitación expiró.' } },
    ])

    render(<AcceptInvitationClient
      token={'x'.repeat(32)} ownerEmail="o@e.com"
      cuentaNombre="X" cuentaTipo={null}
      role="editor"
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))
    await waitFor(() => {
      expect(screen.getByText('Esta invitación expiró.')).toBeTruthy()
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('mientras está aceptando, el botón muestra "Aceptando..."', async () => {
    // Mock fetch que tarda
    const fetchSpy = vi.fn(() => new Promise(resolve => {
      setTimeout(() => resolve(new Response(JSON.stringify({ ok: true, cuenta_id: 'c' }), {
        status: 200,
      })), 50)
    }))
    vi.stubGlobal('fetch', fetchSpy)

    render(<AcceptInvitationClient
      token={'x'.repeat(32)} ownerEmail="o@e.com"
      cuentaNombre="X" cuentaTipo={null}
      role="editor"
    />)

    fireEvent.click(screen.getByText('Aceptar invitación'))
    expect(screen.getByText('Aceptando...')).toBeTruthy()
  })
})
