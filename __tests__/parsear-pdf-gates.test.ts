// Tests para POST /api/parsear-resumen + /api/parsear-tarjeta-pdf
//
// Ambos comparten el mismo gate pattern + el bypass de cupo durante onboarding.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { USAGE_LIMITS_FREE } from '@/lib/usage-limits'

const { createClientMock, rateLimitMock, getUserPlanMock, checkMonthlyMock, isOnboardingMock } = vi.hoisted(() => ({
  createClientMock:  vi.fn(),
  rateLimitMock:     vi.fn(),
  getUserPlanMock:   vi.fn(),
  checkMonthlyMock:  vi.fn(),
  isOnboardingMock:  vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }))
vi.mock('@/lib/subscription', () => ({ getUserPlan: getUserPlanMock }))
vi.mock('@/lib/usage-limits', async () => {
  const actual = await vi.importActual<typeof import('@/lib/usage-limits')>('@/lib/usage-limits')
  return {
    ...actual,
    checkMonthlyLimit:  checkMonthlyMock,
    commitMonthlyUsage: vi.fn(() => Promise.resolve({ allowed: true })),
    isOnboardingActive: isOnboardingMock,
  }
})

import { POST as ParsearResumenPOST }     from '@/app/api/parsear-resumen/route'
import { POST as ParsearTarjetaPdfPOST }  from '@/app/api/parsear-tarjeta-pdf/route'

function makeReq(endpoint: string, body: unknown = { pdf: 'base64...' }): NextRequest {
  return new NextRequest(`http://localhost${endpoint}`, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

const setupSuite = (label: string, endpoint: string, handler: (req: NextRequest) => Promise<Response>) => {
  describe(`gates: ${label}`, () => {
    beforeEach(() => {
      createClientMock.mockReset()
      rateLimitMock.mockReset()
      getUserPlanMock.mockReset()
      checkMonthlyMock.mockReset()
      isOnboardingMock.mockReset()

      createClientMock.mockResolvedValue({ supabase: {}, user: { id: 'u1' } })
      rateLimitMock.mockResolvedValue({ allowed: true, message: '' })
      getUserPlanMock.mockResolvedValue({ plan: 'free', plan_expires_at: null, has_pro_access: false })
      checkMonthlyMock.mockResolvedValue({
        allowed: true, remaining: 1, limit: USAGE_LIMITS_FREE.resumen, used: 0,
      })
      isOnboardingMock.mockResolvedValue(false)
      process.env.ANTHROPIC_API_KEY = 'sk-fake'
    })

    it('401 sin user', async () => {
      createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(401)
    })

    it('429 rate limited', async () => {
      rateLimitMock.mockResolvedValueOnce({ allowed: false, message: 'rl' })
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(429)
    })

    it('rate limit configurado a 3/min (PDF caro)', async () => {
      delete process.env.ANTHROPIC_API_KEY
      await handler(makeReq(endpoint))
      expect(rateLimitMock).toHaveBeenCalledWith('u1', endpoint, { max: 3, windowSeconds: 60 })
    })

    it('429 con feature=resumen si Free llegó al cupo', async () => {
      checkMonthlyMock.mockResolvedValueOnce({
        allowed: false, remaining: 0, limit: USAGE_LIMITS_FREE.resumen, used: USAGE_LIMITS_FREE.resumen,
      })
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBe('limit_reached')
      expect(body.feature).toBe('resumen')
    })

    it('onboarding activo bypasa el cupo (no consume 1/1 del free)', async () => {
      isOnboardingMock.mockResolvedValueOnce(true)
      checkMonthlyMock.mockResolvedValueOnce({
        allowed: false, remaining: 0, limit: 1, used: 1,
      })
      delete process.env.ANTHROPIC_API_KEY  // gateamos antes de Claude

      const res = await handler(makeReq(endpoint))
      // Si bypaseamos el cupo, NO devolvemos 429 con limit_reached → cae al 503
      expect(res.status).toBe(503)
      // El checkMonthlyLimit NO debió haberse llamado siquiera (el code path
      // hace inOnboarding=true → usage=null → no chequea)
      expect(checkMonthlyMock).not.toHaveBeenCalled()
    })

    it('503 sin ANTHROPIC_API_KEY', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toContain('ANTHROPIC_API_KEY')
    })

    it('Pro pasa el gate sin consumir cupo', async () => {
      getUserPlanMock.mockResolvedValueOnce({
        plan: 'pro', plan_expires_at: '2099-01-01', has_pro_access: true,
      })
      checkMonthlyMock.mockResolvedValueOnce({
        allowed: true, remaining: -1, limit: -1, used: -1,
      })
      delete process.env.ANTHROPIC_API_KEY

      const res = await handler(makeReq(endpoint))
      expect(res.status).toBe(503)  // cae al next gate, no es 429
    })
  })
}

setupSuite('POST /api/parsear-resumen',      '/api/parsear-resumen',      ParsearResumenPOST)
setupSuite('POST /api/parsear-tarjeta-pdf',  '/api/parsear-tarjeta-pdf',  ParsearTarjetaPdfPOST)
