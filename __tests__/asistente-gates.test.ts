// Tests para los GATES de los endpoints AI (asistente, asistente-mobile,
// leer-ticket, analitica-insight). Estos endpoints comparten un patrón:
//   - auth (401)
//   - rate limit (429)
//   - usage limit (429 con limit_reached + feature + limit + used)
//   - missing API key (503)
//
// No probamos la integración real con Claude — eso requiere E2E o tests más
// pesados. El valor de testear los gates es que se rompen seguido (cambios
// de lógica de plan, de cupos, etc) y son los puntos de UX-breaking
// frecuentes ("Por qué Manguito no me deja escribir más?").

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { USAGE_LIMITS_FREE } from '@/lib/usage-limits'

const { createClientMock, rateLimitMock, getUserPlanMock, checkMonthlyMock } = vi.hoisted(() => ({
  createClientMock:  vi.fn(),
  rateLimitMock:     vi.fn(),
  getUserPlanMock:   vi.fn(),
  checkMonthlyMock:  vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitMock,
}))

vi.mock('@/lib/subscription', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/usage-limits', async () => {
  const actual = await vi.importActual<typeof import('@/lib/usage-limits')>('@/lib/usage-limits')
  return {
    ...actual,
    checkMonthlyLimit:    checkMonthlyMock,
    commitMonthlyUsage:   vi.fn(() => Promise.resolve({ allowed: true })),
    isOnboardingActive:   vi.fn(() => Promise.resolve(false)),
  }
})

// Importamos los handlers DESPUÉS de los mocks
import { POST as AsistentePOST }       from '@/app/api/asistente/route'
import { POST as AsistenteMobilePOST } from '@/app/api/asistente-mobile/route'
import { POST as LeerTicketPOST }      from '@/app/api/leer-ticket/route'

function makeReq(endpoint: string, body: unknown = { messages: [{ role: 'user', content: 'hola' }] }): NextRequest {
  // NextRequest requiere URL absoluta — prefijamos con http://localhost
  return new NextRequest(`http://localhost${endpoint}`, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

const buildSuiteFor = (label: string, endpoint: string, handler: (req: NextRequest) => Promise<Response>, feature: 'asistente' | 'ticket') => {
  describe(`gates: ${label}`, () => {
    beforeEach(() => {
      createClientMock.mockReset()
      rateLimitMock.mockReset()
      getUserPlanMock.mockReset()
      checkMonthlyMock.mockReset()

      // Defaults: user válido, sin rate limit, free, con cupo
      createClientMock.mockResolvedValue({ supabase: {}, user: { id: 'u1' } })
      rateLimitMock.mockResolvedValue({ allowed: true, message: '' })
      getUserPlanMock.mockResolvedValue({ plan: 'free', plan_expires_at: null, has_pro_access: false })
      checkMonthlyMock.mockResolvedValue({
        allowed: true, remaining: 5, limit: USAGE_LIMITS_FREE[feature], used: 0,
      })

      process.env.ANTHROPIC_API_KEY = 'sk-fake'
    })

    it('401 sin user', async () => {
      createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(401)
    })

    it('429 si rate limit bloqueado', async () => {
      rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'Demasiados pedidos' })
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBe('Demasiados pedidos')
    })

    it('429 con error=limit_reached + feature + limit + used si Free se quedó sin cupo', async () => {
      checkMonthlyMock.mockResolvedValueOnce({
        allowed: false, remaining: 0, limit: USAGE_LIMITS_FREE[feature], used: USAGE_LIMITS_FREE[feature],
      })
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBe('limit_reached')
      expect(body.feature).toBe(feature)
      expect(body.limit).toBe(USAGE_LIMITS_FREE[feature])
      expect(body.used).toBe(USAGE_LIMITS_FREE[feature])
    })

    it('Pro no se queda sin cupo (el helper devuelve allowed=true ilimitado)', async () => {
      getUserPlanMock.mockResolvedValueOnce({
        plan: 'pro', plan_expires_at: '2099-01-01', has_pro_access: true,
      })
      checkMonthlyMock.mockResolvedValueOnce({
        allowed: true, remaining: -1, limit: -1, used: -1,
      })
      delete process.env.ANTHROPIC_API_KEY
      const res = await handler(makeReq(endpoint))
      // Lo gateamos por API key faltante, NO por límite (=> es Pro, pasa)
      expect(res.status).toBe(503)
    })

    it('503 si ANTHROPIC_API_KEY no está configurada', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toContain('ANTHROPIC_API_KEY')
    })

    it('checkRateLimit recibe el endpoint correcto', async () => {
      delete process.env.ANTHROPIC_API_KEY  // corto antes de hablar con Claude
      await handler(makeReq(endpoint))
      expect(rateLimitMock).toHaveBeenCalledWith('u1', endpoint, expect.objectContaining({
        max: expect.any(Number), windowSeconds: 60,
      }))
    })
  })
}

buildSuiteFor('POST /api/asistente',        '/api/asistente',        AsistentePOST,       'asistente')
buildSuiteFor('POST /api/asistente-mobile', '/api/asistente-mobile', AsistenteMobilePOST, 'asistente')

// leer-ticket usa body distinto (image base64 en lugar de messages)
describe('gates: POST /api/leer-ticket', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    rateLimitMock.mockReset()
    getUserPlanMock.mockReset()
    checkMonthlyMock.mockReset()

    createClientMock.mockResolvedValue({ supabase: {}, user: { id: 'u1' } })
    rateLimitMock.mockResolvedValue({ allowed: true, message: '' })
    getUserPlanMock.mockResolvedValue({ plan: 'free', plan_expires_at: null, has_pro_access: false })
    checkMonthlyMock.mockResolvedValue({
      allowed: true, remaining: 3, limit: USAGE_LIMITS_FREE.ticket, used: 0,
    })
    process.env.ANTHROPIC_API_KEY = 'sk-fake'
  })

  function ticketReq(body: unknown = { image: 'base64...', mimeType: 'image/jpeg' }): NextRequest {
    return new NextRequest('http://localhost/api/leer-ticket', { method: 'POST', body: JSON.stringify(body) })
  }

  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await LeerTicketPOST(ticketReq())
    expect(res.status).toBe(401)
  })

  it('429 rate limited', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'rl' })
    const res = await LeerTicketPOST(ticketReq())
    expect(res.status).toBe(429)
  })

  it('429 con feature=ticket si llegó al cupo', async () => {
    checkMonthlyMock.mockResolvedValueOnce({
      allowed: false, remaining: 0, limit: USAGE_LIMITS_FREE.ticket, used: USAGE_LIMITS_FREE.ticket,
    })
    const res = await LeerTicketPOST(ticketReq())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.feature).toBe('ticket')
  })

  it('503 sin ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await LeerTicketPOST(ticketReq())
    expect(res.status).toBe(503)
  })

  it('400 si no se envía image', async () => {
    const res = await LeerTicketPOST(ticketReq({ mimeType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('imagen')
  })

  it('rate limit configurado a 10/min', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await LeerTicketPOST(ticketReq())
    expect(rateLimitMock).toHaveBeenCalledWith('u1', '/api/leer-ticket', { max: 10, windowSeconds: 60 })
  })
})
