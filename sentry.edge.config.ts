// Sentry config para el runtime Edge (middleware, edge functions).
// Hoy no tenemos código en edge runtime, pero Sentry recomienda inicializarlo
// igual por si en el futuro agregamos middleware u otras rutas edge.

import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrubbing'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0,
  sendDefaultPii: false,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

  beforeSend: scrubEvent,
})
