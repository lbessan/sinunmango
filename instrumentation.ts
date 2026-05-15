// Next.js instrumentation: se ejecuta una vez al boot del runtime, antes
// de cualquier request. Lo usamos para inicializar Sentry en server y edge,
// y para validar que las env vars críticas estén configuradas.
//
// Para client-side, ver `instrumentation-client.ts` (lo carga Next 16+ aparte).

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validar env vars críticas. Si faltan, tira error claro al boot en lugar
    // de "supabaseUrl is required" en el primer request.
    const { validateEnv } = await import('./lib/env')
    validateEnv()

    await import('./sentry.server.config')
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Hook de Next 15+ para capturar errores en route handlers / server components
// que no llegaron al error.tsx.
export const onRequestError = Sentry.captureRequestError
