'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── AcceptInvitationClient ──────────────────────────────────────────────────
//
// Renderea el botón Aceptar y maneja el POST a /api/invitations/[token].
// Después de aceptar exitosamente, redirige a la cuenta compartida.

export function AcceptInvitationClient({
  token,
  ownerEmail,
  cuentaNombre,
  cuentaTipo,
  role,
}: {
  token:        string
  ownerEmail:   string
  cuentaNombre: string
  cuentaTipo:   string | null
  role:         'viewer' | 'editor'
}) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const roleLabel = role === 'editor' ? 'colaborar en' : 'ver'

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch(`/api/invitations/${token}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No pudimos aceptar la invitación. Probá de nuevo.')
        setAccepting(false)
        return
      }
      // Redirige a la cuenta compartida
      router.push(`/cuentas/${data.cuenta_id}`)
    } catch {
      setError('Error de conexión. Verificá tu internet y probá de nuevo.')
      setAccepting(false)
    }
  }

  return (
    <>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white mb-4"
        style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 11l-4 4-2-2" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        Invitación de cuenta
      </h1>
      <p className="text-slate-600 leading-relaxed mb-6">
        <strong>{ownerEmail}</strong> te invita a {roleLabel}{' '}
        <strong>{cuentaNombre}</strong>
        {cuentaTipo && ` (${cuentaTipo})`}.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-slate-700 font-medium mb-1">
          Como {role === 'editor' ? 'colaborador' : 'visualizador'} vas a poder:
        </p>
        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li>Ver todos los movimientos de la cuenta (incluso los anteriores)</li>
          {role === 'editor' && <li>Crear nuevos movimientos en la cuenta</li>}
          {role === 'viewer' && <li className="text-slate-400">Crear movimientos — no permitido (rol viewer)</li>}
        </ul>
        <p className="text-xs text-slate-500 mt-3">
          No podés editar la cuenta en sí (nombre, color, etc.) ni eliminarla — eso lo
          maneja el dueño. Tampoco vas a ver otras cuentas de {ownerEmail}.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleAccept}
        disabled={accepting}
        className="block w-full text-center px-5 py-3 rounded-xl text-white font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}
      >
        {accepting ? 'Aceptando...' : 'Aceptar invitación'}
      </button>
      <p className="text-xs text-slate-400 mt-3 text-center">
        Podés salir de la cuenta compartida en cualquier momento desde Configuración.
      </p>
    </>
  )
}
