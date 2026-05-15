// Next.js instrumentation: se ejecuta una vez al boot del runtime, antes
// de cualquier request. Lo usamos para inicializar Sentry en server y edge.
//
// Para client-side, ver `instrumentation-client.ts` (lo carga Next 16+ aparte).

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Hook de Next 15+ para capturar errores en route handlers / server components
// que no llegaron al error.tsx.
export const onRequestError = Sentry.captureRequestError
