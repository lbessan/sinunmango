'use client'

// Boundary de último recurso: se activa solo si revienta el root layout
// (app/layout.tsx) y reemplaza el <html> entero. Por eso este archivo
// renderiza su propio <html> y <body> — no hereda nada de Next.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

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
    <html lang="es">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f1f5f9',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: 'white',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: 32,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
            La app no pudo iniciar
          </p>
          <p style={{ fontSize: 14, color: '#475569', margin: '0 0 24px' }}>
            Algo falló cargando sinunmango. Ya quedó registrado.
          </p>

          {error.digest && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 24px' }}>
              Código: <code style={{ fontFamily: 'monospace' }}>{error.digest}</code>
            </p>
          )}

          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              background: 'linear-gradient(90deg, #1B3A6B, #1a6b5a)',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
