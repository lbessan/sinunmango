// Sentry config para el runtime de Node.js (server components, route handlers).
// Si NEXT_PUBLIC_SENTRY_DSN no está seteado, Sentry queda en modo no-op
// (no manda nada). Esto permite deployar sin el DSN configurado.

import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrubbing'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sin tracing por ahora (cuesta cupo y no lo necesitamos para arrancar).
  tracesSampleRate: 0,

  // No mandar PII automáticamente (IP, request bodies, etc.).
  // El scrubEvent abajo hace una segunda pasada por si Sentry deja algo.
  sendDefaultPii: false,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

  beforeSend: scrubEvent,
})
