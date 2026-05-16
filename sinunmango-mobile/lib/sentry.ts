// ─── Inicialización de Sentry para mobile ────────────────────────────────────
//
// Estrategia paralela a la web:
//   - Sin tracing (tracesSampleRate: 0) — no necesitamos performance todavía
//   - sendDefaultPii: false (no enviar IP/device beyond minimum)
//   - beforeSend con scrubbing agresivo (emails, UUIDs, montos)
//   - Desactivado en dev (__DEV__) para no enviar eventos de prueba a prod
//
// El init corre antes de mount de cualquier componente (lo importamos al tope
// de app/_layout.tsx). Si el DSN está vacío, Sentry queda en no-op.

import * as Sentry from '@sentry/react-native'
import Constants from 'expo-constants'
import { scrubEvent } from './sentry-scrubbing'

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? ''

if (DSN && !__DEV__) {
  Sentry.init({
    dsn:               DSN,
    tracesSampleRate:  0,
    sendDefaultPii:    false,
    environment:       process.env.EXPO_PUBLIC_ENV ?? 'production',
    release:           Constants.expoConfig?.version,
    beforeSend:        scrubEvent,
  })
}

export { Sentry }
