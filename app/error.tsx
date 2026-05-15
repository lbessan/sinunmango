'use client'

// Error boundary para rutas fuera del grupo (app) — login, onboarding, etc.
// Para errores dentro del grupo autenticado, usar app/(app)/error.tsx que
// preserva la AppShell.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg-main, #f1f5f9)' }}
    >
      <div
        className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center"
        style={{ backgroundColor: 'var(--bg-card, #ffffff)' }}
      >
        <p className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary, #1e293b)' }}>
          Algo salió mal
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary, #475569)' }}>
          Tuvimos un problema cargando esta pantalla. Ya quedó registrado y vamos a revisarlo.
        </p>

        {error.digest && (
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted, #94a3b8)' }}>
            Código: <code className="font-mono">{error.digest}</code>
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 inline-flex items-center"
            style={{ color: 'var(--text-secondary, #475569)' }}
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
