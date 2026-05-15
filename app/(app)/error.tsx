'use client'

// Error boundary para rutas autenticadas dentro de (app).
// Se renderiza adentro del AppShell, así que el usuario sigue viendo el
// sidebar y la navegación funciona — solo el contenido principal muestra
// el fallback.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function AppRouteErrorBoundary({
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
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm text-center">
      <p className="font-bold text-lg mb-2 text-slate-900">
        No pudimos cargar esto
      </p>
      <p className="text-sm text-slate-500 mb-6">
        Tuvimos un problema mostrando esta pantalla. Probá de nuevo o volvé al dashboard.
      </p>

      {error.digest && (
        <p className="text-xs text-slate-400 mb-6">
          Código: <code className="font-mono">{error.digest}</code>
        </p>
      )}

      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg text-white text-sm font-medium"
        style={{ background: 'linear-gradient(90deg, var(--accent2), var(--accent))' }}
      >
        Reintentar
      </button>
    </div>
  )
}
