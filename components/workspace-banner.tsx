'use client'

// Banner que aparece cuando el user está viendo un workspace ajeno
// (invitee en el workspace de otra persona). Da contexto explícito de
// que la data que está viendo NO es la suya y un botón rápido para
// volver al propio workspace.
//
// El switcher en el sidebar también señaliza esto pero un banner full-width
// arriba del main content lo hace inevitable de notar — clave para que el
// invitee no se confunda y crea que está viendo sus propios números.

import { useState } from 'react'
import { ArrowLeft, Eye, Pencil } from 'lucide-react'

interface WorkspaceBannerProps {
  ownerEmail: string | null
  role: 'viewer' | 'editor'
  /** El user.id del cliente (no del owner del workspace) — necesario para
   * el switch back: el endpoint /api/workspace/switch interpreta
   * workspace_id === user.id como "clear cookie". */
  myUserId: string
}

export function WorkspaceBanner({ ownerEmail, role, myUserId }: WorkspaceBannerProps) {
  const [returning, setReturning] = useState(false)

  const handleReturn = async () => {
    setReturning(true)
    try {
      const res = await fetch('/api/workspace/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: myUserId }),
      })
      if (res.ok) {
        // Reload completa para refetch RSCs con la nueva cookie.
        window.location.href = '/dashboard'
      } else {
        setReturning(false)
      }
    } catch {
      setReturning(false)
    }
  }

  // Color de fondo amber para diferenciarlo del header de marca azul
  // y del bg-slate del contenido — debe gritar "estás en otro contexto".
  return (
    <div
      className="px-4 lg:px-8 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm border-b border-amber-200"
      style={{ background: '#fef3c7' }}
      data-testid="workspace-banner"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {role === 'editor' ? (
          <Pencil size={14} className="text-amber-700 shrink-0" />
        ) : (
          <Eye size={14} className="text-amber-700 shrink-0" />
        )}
        <p className="text-amber-900 truncate">
          Estás viendo el workspace de{' '}
          <span className="font-semibold">{ownerEmail ?? 'otro usuario'}</span>
          <span className="hidden sm:inline text-amber-700">
            {' '}· {role === 'editor' ? 'podés cargar movimientos' : 'solo lectura'}
          </span>
        </p>
      </div>
      <button
        onClick={handleReturn}
        disabled={returning}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-amber-800 hover:bg-amber-50 transition-colors text-xs font-medium border border-amber-300 shrink-0 disabled:opacity-60"
      >
        <ArrowLeft size={13} />
        {returning ? 'Volviendo...' : 'Volver al mío'}
      </button>
    </div>
  )
}
