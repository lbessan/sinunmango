// Sentry init para el bundle del cliente (browser).
// Next 16+ carga este archivo automáticamente como parte de instrumentation.
// Si NEXT_PUBLIC_SENTRY_DSN no está seteado, queda en modo no-op.

import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrubbing'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sin tracing ni replay por ahora.
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // No mandar IP ni cookies. El scrubEvent hace una segunda pasada.
  sendDefaultPii: false,

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

  beforeSend: scrubEvent,
})

// Required: Next.js usa este hook para reportar navigation errors a Sentry.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
