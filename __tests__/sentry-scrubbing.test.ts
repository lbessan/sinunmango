import { describe, it, expect } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrubbing'

// scrubEvent es el beforeSend hook que aplica Sentry: borra emails, UUIDs,
// montos y request body antes de mandar a sentry.io. Como es una app de
// finanzas, NO podemos dejar que estos datos lleguen al servicio externo.

function makeEvent(over: Partial<ErrorEvent>): ErrorEvent {
  return { event_id: 'test', ...over } as ErrorEvent
}

describe('scrubEvent — user', () => {
  it('reemplaza user.id por flag "authenticated"', () => {
    const e = scrubEvent(makeEvent({
      user: { id: '12345678-1234-1234-1234-123456789012', email: 'lucho@example.com' },
    }))
    expect(e!.user).toEqual({ id: 'authenticated' })
  })

  it('si user no tiene id, devuelve objeto vacío', () => {
    const e = scrubEvent(makeEvent({ user: { username: 'foo' } }))
    expect(e!.user).toEqual({})
  })
})

describe('scrubEvent — request', () => {
  it('borra body, query_string, cookies', () => {
    const e = scrubEvent(makeEvent({
      request: {
        url:          'https://app.sinunmango.com.ar/api/movimientos?id=abc',
        data:         { monto: 1234, detalle: 'Privado' },
        query_string: 'id=abc&secret=xyz',
        cookies:      { session: 'abc', auth: 'xyz' },
        headers:      { 'content-type': 'application/json' },
      },
    }))
    expect(e!.request!.data).toBeUndefined()
    expect(e!.request!.query_string).toBeUndefined()
    expect(e!.request!.cookies).toBeUndefined()
    expect(e!.request!.url).toBe('https://app.sinunmango.com.ar/api/movimientos')
  })

  it('borra Authorization y Cookie headers, deja los demás', () => {
    const e = scrubEvent(makeEvent({
      request: {
        headers: {
          'authorization': 'Bearer secret',
          'cookie':        'session=xyz',
          'content-type':  'application/json',
          'user-agent':    'Mozilla',
        },
      },
    }))
    const h = e!.request!.headers as Record<string, string>
    expect(h.authorization).toBeUndefined()
    expect(h.cookie).toBeUndefined()
    expect(h['content-type']).toBe('application/json')
    expect(h['user-agent']).toBe('Mozilla')
  })

  it('filtra headers x-* (custom headers que pueden tener secrets)', () => {
    const e = scrubEvent(makeEvent({
      request: { headers: { 'x-api-key': 'secret', 'content-type': 'json' } },
    }))
    const h = e!.request!.headers as Record<string, string>
    expect(h['x-api-key']).toBeUndefined()
  })
})

describe('scrubEvent — message y exception', () => {
  it('reemplaza emails en el mensaje', () => {
    const e = scrubEvent(makeEvent({
      message: 'Error procesando email para lucho.bessan@gmail.com',
    }))
    expect(e!.message).toBe('Error procesando email para [redacted-email]')
  })

  it('reemplaza UUIDs en el mensaje', () => {
    const e = scrubEvent(makeEvent({
      message: 'User abc12345-1234-1234-1234-abcdef123456 falló al pagar',
    }))
    expect(e!.message).toBe('User [redacted-uuid] falló al pagar')
  })

  it('reemplaza montos con formato AR ($1.234,56) en el mensaje', () => {
    const e = scrubEvent(makeEvent({
      message: 'Saldo insuficiente: $1.234,56',
    }))
    expect(e!.message).toContain('[redacted-amount]')
    expect(e!.message).not.toContain('1.234,56')
  })

  it('reemplaza montos con prefijo USD/ARS', () => {
    const e = scrubEvent(makeEvent({
      message: 'Conversión USD 500 a ARS 600000',
    }))
    expect(e!.message).toContain('[redacted-amount]')
    expect(e!.message).not.toContain('USD 500')
    expect(e!.message).not.toContain('ARS 600000')
  })

  it('no toca códigos de error de 3 dígitos (404, 500)', () => {
    const e = scrubEvent(makeEvent({
      message: 'HTTP 404 Not Found, HTTP 500 Internal',
    }))
    expect(e!.message).toBe('HTTP 404 Not Found, HTTP 500 Internal')
  })

  it('scrub también en exception.values[].value', () => {
    const e = scrubEvent(makeEvent({
      exception: {
        values: [{
          type:  'Error',
          value: 'Failed for user@test.com con monto $50.000',
        }],
      },
    }))
    expect(e!.exception!.values![0].value).toContain('[redacted-email]')
    expect(e!.exception!.values![0].value).toContain('[redacted-amount]')
  })
})

describe('scrubEvent — breadcrumbs', () => {
  it('scrub message y data en cada breadcrumb', () => {
    const e = scrubEvent(makeEvent({
      breadcrumbs: [
        {
          category: 'fetch',
          message:  'POST a /api/movimientos con foo@bar.com',
          data:     { body: { monto: 1234, detalle: 'comida' }, url: 'https://x.com' },
        },
      ],
    }))
    const b = e!.breadcrumbs![0]
    expect(b.message).toContain('[redacted-email]')
    expect(b.data).toBeDefined()
  })
})

describe('scrubEvent — extras y contexts', () => {
  it('aplica scrub recursivo a extras', () => {
    const e = scrubEvent(makeEvent({
      extra: {
        userInfo:  'lucho@example.com',
        nested:    { uuid: '12345678-1234-1234-1234-123456789012', monto: 'USD 1000' },
      },
    }))
    const extra = e!.extra as Record<string, unknown>
    expect(extra.userInfo).toBe('[redacted-email]')
    const nested = extra.nested as Record<string, unknown>
    expect(nested.uuid).toBe('[redacted-uuid]')
    expect(nested.monto).toContain('[redacted-amount]')
  })

  it('respeta el límite de profundidad (no recurse infinito)', () => {
    // Construye un objeto de 10 niveles
    let nested: Record<string, unknown> = { email: 'a@b.com' }
    for (let i = 0; i < 10; i++) nested = { deeper: nested }
    const e = scrubEvent(makeEvent({ extra: nested as unknown as Record<string, unknown> }))
    // No tiene que crashear ni colgarse; el scrub aplica solo hasta cierta profundidad.
    expect(e).not.toBeNull()
  })

  it('no toca primitivos no-string (números, booleans)', () => {
    const e = scrubEvent(makeEvent({
      extra: { count: 42, active: true, ratio: 3.14 },
    }))
    const extra = e!.extra as Record<string, unknown>
    expect(extra.count).toBe(42)
    expect(extra.active).toBe(true)
    expect(extra.ratio).toBe(3.14)
  })
})

describe('scrubEvent — eventos sin campos sensibles', () => {
  it('devuelve evento intacto si no hay nada que scrubear', () => {
    const e = scrubEvent(makeEvent({
      message: 'Some non-sensitive error',
      tags:    { feature: 'asistente' },
    }))
    expect(e!.message).toBe('Some non-sensitive error')
    expect(e!.tags).toEqual({ feature: 'asistente' })
  })
})
