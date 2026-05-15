// ─── Scrubbing agresivo para Sentry ──────────────────────────────────────────
//
// sinunmango es una app de finanzas: NO queremos que montos, emails, user IDs
// o saldos lleguen a un servicio externo. Aplicamos un beforeSend hook común
// que se monta tanto en client como en server.
//
// Lo que SÍ queda:
//   - stack trace
//   - ruta (request.url, pero sin query string)
//   - nombre/mensaje del error
//   - breadcrumbs no sensibles
//
// Lo que SE BORRA:
//   - request body (puede contener montos, IDs, descripciones)
//   - query string (puede contener IDs)
//   - cookies (sesión Supabase)
//   - headers de auth
//   - user.id (UUID) → reemplazado por presencia booleana
//   - user.email → eliminado
//   - cualquier cosa que parezca un mail o un monto en strings libres

import type { ErrorEvent, EventHint } from '@sentry/nextjs'

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// Montos típicos: "$1.234", "$ 1.234,56", "1234.56", "USD 100", "ARS 50000".
// Apuntamos a tokens >=3 dígitos para no comerse códigos de error como "404".
const AMOUNT_RE = /(?:\$|USD|ARS|U\$S)\s*-?\d[\d.,]{2,}|\b-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b/g
const UUID_RE   = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

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

export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  // ── user: solo dejamos un flag de presencia, no el UUID ni el email ───────
  if (event.user) {
    event.user = event.user.id ? { id: 'authenticated' } : {}
  }

  // ── request: borramos body, query string, cookies y headers de auth ──────
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

  // ── extras y contexts pueden traer datos del usuario; los recorremos ──────
  if (event.extra)    event.extra    = scrubDeep(event.extra)
  if (event.contexts) event.contexts = scrubDeep(event.contexts)
  if (event.tags)     event.tags     = scrubDeep(event.tags)

  // ── breadcrumbs: scrubbear mensajes y data ───────────────────────────────
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(b => ({
      ...b,
      message: b.message ? scrubString(b.message) : b.message,
      data:    b.data    ? scrubDeep(b.data)      : b.data,
    }))
  }

  // ── mensaje del error y stack frames con vars locales ────────────────────
  if (event.message) event.message = scrubString(event.message)
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map(v => ({
      ...v,
      value: v.value ? scrubString(v.value) : v.value,
    }))
  }

  return event
}
