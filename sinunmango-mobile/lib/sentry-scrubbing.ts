// ─── Scrubbing agresivo para Sentry RN ──────────────────────────────────────
//
// Mirror del scrubbing de la web (lib/sentry-scrubbing.ts en raíz). Para una
// app de finanzas NO queremos que montos, emails, user IDs o saldos lleguen
// a un servicio externo. El SDK lo aplica via beforeSend hook.
//
// Lo que SÍ queda:
//   - stack trace
//   - URL de request (sin query string)
//   - mensaje del error
//   - breadcrumbs no sensibles
//
// Lo que SE BORRA:
//   - request body / query string / cookies
//   - headers de auth (Authorization, x-*)
//   - user.id (UUID) → reemplazado por flag 'authenticated'
//   - emails, montos AR/USD, UUIDs en cualquier string

import type { ErrorEvent } from '@sentry/react-native'

const EMAIL_RE  = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const UUID_RE   = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// Montos: "$1.234", "$ 1.234,56", "USD 500", "ARS 600000". Mínimo 3 dígitos
// para no comerse códigos HTTP (404, 500).
const AMOUNT_RE = /(?:\$|USD|ARS|U\$S)\s*-?\d[\d.,]{2,}|\b-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b/g

function scrubString(s: string): string {
  return s
    .replace(EMAIL_RE,  '[redacted-email]')
    .replace(UUID_RE,   '[redacted-uuid]')
    .replace(AMOUNT_RE, '[redacted-amount]')
}

function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 6 || value == null) return value
  if (typeof value === 'string') return scrubString(value) as unknown as T
  if (Array.isArray(value)) return value.map(v => scrubDeep(v, depth + 1)) as unknown as T
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubDeep(v, depth + 1)
    }
    return out as T
  }
  return value
}

// Firma del beforeSend hook. El segundo arg (hint) lo tipamos como unknown
// porque EventHint no se reexporta desde @sentry/react-native (solo desde
// @sentry/core) y no lo usamos.
export function scrubEvent(event: ErrorEvent, _hint?: unknown): ErrorEvent | null {
  if (event.user) {
    event.user = event.user.id ? { id: 'authenticated' } : {}
  }

  if (event.request) {
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0]
    }
    delete event.request.cookies
    delete event.request.data
    delete event.request.query_string
    if (event.request.headers) {
      const safe: Record<string, string> = {}
      for (const [k, v] of Object.entries(event.request.headers as Record<string, string>)) {
        const lower = k.toLowerCase()
        if (lower === 'authorization' || lower === 'cookie' || lower.startsWith('x-')) continue
        if (typeof v === 'string') safe[k] = scrubString(v)
      }
      event.request.headers = safe
    }
  }

  if (event.extra)    event.extra    = scrubDeep(event.extra)
  if (event.contexts) event.contexts = scrubDeep(event.contexts)
  if (event.tags)     event.tags     = scrubDeep(event.tags)

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(b => ({
      ...b,
      message: b.message ? scrubString(b.message) : b.message,
      data:    b.data    ? scrubDeep(b.data)      : b.data,
    }))
  }

  if (event.message) {
    // RN puede tipar message como string o como { message, params }
    if (typeof event.message === 'string') {
      event.message = scrubString(event.message)
    }
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map(v => ({
      ...v,
      value: v.value ? scrubString(v.value) : v.value,
    }))
  }

  return event
}
