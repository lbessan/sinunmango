import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Solo testeamos el dispatcher de notificaciones (lógica de negocio del
// webhook). El POST handler completo hace Pub/Sub parse + OAuth con RSA
// JWT signing + fetch al Play API — esa parte es plumbing y requeriría
// generar una RSA keypair real en el test setup, además de mockear fetch
// para dos URLs distintas. El beneficio de testear esa plumbing es bajo
// (es código casi puro de I/O); el del dispatcher es alto (define cuándo
// un user pasa a Pro/Free).

vi.mock('@/lib/subscription', () => ({
  updateUserPlan: vi.fn().mockResolvedValue(undefined),
}))

import { dispatchSubscriptionNotification, NOTIF } from '@/app/api/webhooks/google-play/route'
import { updateUserPlan } from '@/lib/subscription'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const PURCHASE_TOKEN = 'fake-purchase-token'
const SUBSCRIPTION_ID = 'pro_monthly'
const EXPIRES_AT = '2026-12-31T00:00:00.000Z'

function makeInput(notificationType: number, over: Partial<Parameters<typeof dispatchSubscriptionNotification>[0]> = {}) {
  return {
    notificationType,
    userId:         USER_ID,
    expiresAt:      EXPIRES_AT,
    purchaseToken:  PURCHASE_TOKEN,
    subscriptionId: SUBSCRIPTION_ID,
    ...over,
  }
}

beforeEach(() => {
  vi.mocked(updateUserPlan).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dispatchSubscriptionNotification — eventos que otorgan Pro', () => {
  const PRO_TYPES: { name: string; type: number }[] = [
    { name: 'PURCHASED',       type: NOTIF.PURCHASED       },
    { name: 'RENEWED',         type: NOTIF.RENEWED         },
    { name: 'RECOVERED',       type: NOTIF.RECOVERED       },
    { name: 'RESTARTED',       type: NOTIF.RESTARTED       },
    { name: 'IN_GRACE_PERIOD', type: NOTIF.IN_GRACE_PERIOD },
  ]

  for (const { name, type } of PRO_TYPES) {
    it(`${name} → updateUserPlan('pro') con expires, token y subscription`, async () => {
      const result = await dispatchSubscriptionNotification(makeInput(type))
      expect(result.planTo).toBe('pro')
      expect(updateUserPlan).toHaveBeenCalledExactlyOnceWith(USER_ID, 'pro', {
        plan_expires_at:        EXPIRES_AT,
        google_purchase_token:  PURCHASE_TOKEN,
        google_subscription_id: SUBSCRIPTION_ID,
      })
    })
  }
})

describe('dispatchSubscriptionNotification — CANCELED', () => {
  it('CANCELED → mantiene pro (la app degrada solo cuando llega EXPIRED)', async () => {
    const result = await dispatchSubscriptionNotification(makeInput(NOTIF.CANCELED))
    expect(result.planTo).toBe('pro')
    expect(updateUserPlan).toHaveBeenCalledExactlyOnceWith(USER_ID, 'pro', {
      plan_expires_at:        EXPIRES_AT,
      google_purchase_token:  PURCHASE_TOKEN,
      google_subscription_id: SUBSCRIPTION_ID,
    })
  })
})

describe('dispatchSubscriptionNotification — eventos que degradan a Free', () => {
  const FREE_TYPES: { name: string; type: number }[] = [
    { name: 'EXPIRED', type: NOTIF.EXPIRED },
    { name: 'REVOKED', type: NOTIF.REVOKED },
    { name: 'ON_HOLD', type: NOTIF.ON_HOLD },
  ]

  for (const { name, type } of FREE_TYPES) {
    it(`${name} → updateUserPlan('free') con plan_expires_at=null pero conservando token/sub_id`, async () => {
      const result = await dispatchSubscriptionNotification(makeInput(type))
      expect(result.planTo).toBe('free')
      expect(updateUserPlan).toHaveBeenCalledExactlyOnceWith(USER_ID, 'free', {
        plan_expires_at:        null,
        google_purchase_token:  PURCHASE_TOKEN,
        google_subscription_id: SUBSCRIPTION_ID,
      })
    })
  }
})

describe('dispatchSubscriptionNotification — ignorados', () => {
  const IGNORED_TYPES = [
    NOTIF.PRICE_CHANGE_CONFIRMED,
    NOTIF.DEFERRED,
    NOTIF.PAUSED,
    NOTIF.PAUSE_SCHEDULE_CHANGED,
    9999,  // tipo desconocido
  ]

  for (const type of IGNORED_TYPES) {
    it(`tipo ${type} → planTo='ignored' sin updateUserPlan`, async () => {
      const result = await dispatchSubscriptionNotification(makeInput(type))
      expect(result.planTo).toBe('ignored')
      expect(updateUserPlan).not.toHaveBeenCalled()
    })
  }
})

describe('dispatchSubscriptionNotification — propagación de errores', () => {
  it('si updateUserPlan tira, el error se propaga al caller (que devuelve 500)', async () => {
    vi.mocked(updateUserPlan).mockRejectedValueOnce(new Error('DB down'))
    await expect(
      dispatchSubscriptionNotification(makeInput(NOTIF.PURCHASED))
    ).rejects.toThrow('DB down')
  })
})

describe('dispatchSubscriptionNotification — edge cases', () => {
  it('PURCHASED con expiresAt=null → plan_expires_at=null en updateUserPlan', async () => {
    await dispatchSubscriptionNotification(makeInput(NOTIF.PURCHASED, { expiresAt: null }))
    expect(updateUserPlan).toHaveBeenCalledWith(USER_ID, 'pro', expect.objectContaining({
      plan_expires_at: null,
    }))
  })
})
