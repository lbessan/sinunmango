'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, Loader2, RotateCcw, LogOut } from 'lucide-react'

// ─── AccountDeletedClient ─────────────────────────────────────────────────────
//
// UI del flow de recuperación durante el grace period.
// Dos acciones:
//   - "Recuperar mi cuenta" → POST /api/me/restore → /dashboard
//   - "Cerrar sesión" → signOut → /login (queda esperando que pase la purga)

export function AccountDeletedClient({
  email,
  daysLeft,
  purgeDate,
}: {
  email:    string
  daysLeft: number
  purgeDate: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<'restore' | 'logout' | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const handleRestore = async () => {
    setLoading('restore')
    setError(null)
    try {
      const res = await fetch('/api/me/restore', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos restaurar tu cuenta.')
      setLoading(null)
    }
  }

  const handleLogout = async () => {
    setLoading('logout')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const purgeFmt = new Date(purgeDate).toLocaleDateString('es-AR', {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-5 shadow-sm">
      <div className="flex items-center justify-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
          <AlertCircle size={28} className="text-amber-500" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-slate-800">
          Tu cuenta está pendiente de eliminación
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Pediste eliminar la cuenta de <strong className="text-slate-700 break-all">{email}</strong>.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-center">
        {daysLeft > 0 ? (
          <>
            <p className="text-sm font-semibold text-slate-800">
              Tenés <span className="text-amber-600">{daysLeft} día{daysLeft !== 1 ? 's' : ''}</span> para recuperarla
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Después de eso (el {purgeFmt}), los datos se borran definitivamente.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            La eliminación definitiva está prevista para hoy. Si querés
            recuperarla, es ahora.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleRestore}
          disabled={!!loading}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white shadow-md transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, var(--accent2, #1B3A6B) 0%, var(--accent, #1a6b5a) 100%)' }}
        >
          {loading === 'restore'
            ? <><Loader2 size={16} className="animate-spin" /> Restaurando...</>
            : <><RotateCcw size={16} /> Recuperar mi cuenta</>
          }
        </button>

        <button
          onClick={handleLogout}
          disabled={!!loading}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading === 'logout'
            ? <><Loader2 size={16} className="animate-spin" /> Saliendo...</>
            : <><LogOut size={16} /> No, cerrar sesión</>
          }
        </button>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Si cerrás sesión, podés volver a entrar y recuperarla antes de los
        {' '}{daysLeft} día{daysLeft !== 1 ? 's' : ''}.
      </p>
    </div>
  )
}
