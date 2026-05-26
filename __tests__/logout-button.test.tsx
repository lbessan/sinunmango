// @vitest-environment happy-dom
//
// Tests para components/logout-button.tsx — trivial pero esencial.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LogoutButton } from '@/components/logout-button'

const signOutMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: signOutMock } }),
}))

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
  signOutMock.mockReset()
  pushMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('LogoutButton', () => {
  it('renderea texto + ícono', () => {
    render(<LogoutButton />)
    expect(screen.getByText('Cerrar sesión')).toBeTruthy()
    expect(screen.getByRole('button').querySelector('svg')).toBeTruthy()
  })

  it('click → signOut + redirect a /login', async () => {
    signOutMock.mockResolvedValueOnce({ error: null })

    render(<LogoutButton />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1)
      expect(pushMock).toHaveBeenCalledWith('/login')
    })
  })

  it('signOut llamado ANTES de push (sino router pisaría la sesión)', async () => {
    const callOrder: string[] = []
    signOutMock.mockImplementationOnce(() => {
      callOrder.push('signOut')
      return Promise.resolve({ error: null })
    })
    pushMock.mockImplementationOnce(() => { callOrder.push('push') })

    render(<LogoutButton />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(callOrder).toEqual(['signOut', 'push']))
  })
})
