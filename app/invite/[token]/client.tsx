'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Receipt, TrendingUp } from 'lucide-react'

// ─── AcceptInvitationClient (V2) ────────────────────────────────────────────
//
// Renderea el resumen de la invitación + botón Aceptar. Después de aceptar,
// redirige al dashboard (que va a mostrar el workspace del owner).

export function AcceptInvitationClient({
  token, ownerEmail, role, counts,
}: {
  token:       string
  ownerEmail:  string
  role:        'viewer' | 'editor'
  counts:      { cuentas: number; gastos_fijos: number; inversiones: number }
}) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch(`/api/invitations/${token}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No pudimos aceptar la invitación.')
        setAccepting(false)
        return
      }
      // Después de aceptar, switch al workspace del owner y vamos al dashboard.
      await fetch('/api/workspace/switch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspace_id: data.owner_user_id }),
      })
      router.push('/dashboard')
    } catch {
      setError('Error de conexión.')
      setAccepting(false)
    }
  }

  const total = counts.cuentas + counts.gastos_fijos + counts.inversiones

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
      <h1 className="text-2xl font-bold text-slate-900 mb-3">Invitación a workspace</h1>
      <p className="text-slate-600 leading-relaxed mb-6">
        <strong>{ownerEmail}</strong> te invita a{' '}
        {role === 'editor' ? <strong>colaborar en</strong> : <strong>ver</strong>}{' '}
        su workspace de sinunmango.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
        <p className="text-sm font-semibold text-slate-800 mb-2">
          Vas a tener acceso a:
        </p>
        <ul className="text-sm text-slate-600 space-y-1.5">
          {counts.cuentas > 0 && (
            <li className="flex items-center gap-2">
              <Wallet size={14} className="text-slate-400" />
              {counts.cuentas} {counts.cuentas === 1 ? 'cuenta' : 'cuentas'} (incluye tarjetas)
            </li>
          )}
          {counts.gastos_fijos > 0 && (
            <li className="flex items-center gap-2">
              <Receipt size={14} className="text-slate-400" />
              {counts.gastos_fijos} {counts.gastos_fijos === 1 ? 'gasto fijo' : 'gastos fijos'}
            </li>
          )}
          {counts.inversiones > 0 && (
            <li className="flex items-center gap-2">
              <TrendingUp size={14} className="text-slate-400" />
              {counts.inversiones} {counts.inversiones === 1 ? 'inversión' : 'inversiones'}
            </li>
          )}
          {total === 0 && (
            <li className="text-slate-400">El dueño todavía no compartió recursos.</li>
          )}
        </ul>
        <p className="text-xs text-slate-500 mt-3">
          {role === 'editor'
            ? 'Como colaborador, podés cargar movimientos en las cuentas compartidas.'
            : 'Como visualizador, solo podés ver. No podés crear ni editar nada.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <button onClick={handleAccept} disabled={accepting}
              className="block w-full text-center px-5 py-3 rounded-xl text-white font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
        {accepting ? 'Aceptando...' : 'Aceptar invitación'}
      </button>
      <p className="text-xs text-slate-400 mt-3 text-center">
        Vas a poder volver a tu propio workspace en cualquier momento desde el sidebar.
      </p>
    </>
  )
}
