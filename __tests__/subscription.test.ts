import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getUserPlan, getUserPlanById } from '@/lib/subscription'
import { createSupabaseMock } from './__helpers__/mock-supabase'

// ─── has_pro_access es la lógica crítica que define si un user puede usar ───
// features Pro. Cubrimos los caminos:
//   - free                          → false
//   - pro + expires futuro          → true
//   - pro + expires pasado          → false  (se debe degradar a free)
//   - pro + expires null            → true   (Pro sin vencimiento)
//   - grandfathered (cualquier exp) → true
//   - no profile row                → false  (default plan free)

const NOW = new Date('2026-05-15T12:00:00Z')
const FUTURO = '2026-12-31T00:00:00Z'
const PASADO = '2026-01-01T00:00:00Z'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

describe('getUserPlan', () => {
  it('devuelve DEFAULT_PLAN (free, sin pro) si no hay fila en user_profiles', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: { data: null, error: null } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan).toEqual({
      plan: 'free',
      plan_expires_at: null,
      google_subscription_id: null,
      has_pro_access: false,
    })
  })

  it('free explícito → has_pro_access=false', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'free', plan_expires_at: null, google_subscription_id: null },
        error: null,
      } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan.has_pro_access).toBe(false)
    expect(plan.plan).toBe('free')
  })

  it('pro con expires futuro → has_pro_access=true', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'pro', plan_expires_at: FUTURO, google_subscription_id: 'sub_123' },
        error: null,
      } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan.has_pro_access).toBe(true)
    expect(plan.plan).toBe('pro')
    expect(plan.google_subscription_id).toBe('sub_123')
  })

  it('pro con expires pasado → has_pro_access=false (degradado)', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'pro', plan_expires_at: PASADO, google_subscription_id: 'sub_123' },
        error: null,
      } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan.has_pro_access).toBe(false)
    expect(plan.plan).toBe('pro')                  // el plan en DB no cambió
    expect(plan.plan_expires_at).toBe(PASADO)
  })

  it('pro sin expires (null) → has_pro_access=true (lifetime)', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'pro', plan_expires_at: null, google_subscription_id: null },
        error: null,
      } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan.has_pro_access).toBe(true)
  })

  it('grandfathered con expires pasado → has_pro_access=true (la expiración no aplica)', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'grandfathered', plan_expires_at: PASADO, google_subscription_id: null },
        error: null,
      } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan.has_pro_access).toBe(true)
  })

  it('plan null en DB se interpreta como free', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: null, plan_expires_at: null, google_subscription_id: null },
        error: null,
      } },
    })
    const plan = await getUserPlan(supabase)
    expect(plan.plan).toBe('free')
    expect(plan.has_pro_access).toBe(false)
  })
})

describe('getUserPlanById', () => {
  it('usa el cliente admin con .eq(user_id, …) y mismo cálculo de has_pro_access', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'pro', plan_expires_at: FUTURO, google_subscription_id: null },
        error: null,
      } },
    })
    const plan = await getUserPlanById(supabase, 'user-uuid')
    expect(plan.has_pro_access).toBe(true)
    expect(plan.plan).toBe('pro')
  })

  it('sin fila → DEFAULT_PLAN', async () => {
    const supabase = createSupabaseMock({
      table: { user_profiles: { data: null, error: null } },
    })
    const plan = await getUserPlanById(supabase, 'user-uuid')
    expect(plan).toEqual({
      plan: 'free',
      plan_expires_at: null,
      google_subscription_id: null,
      has_pro_access: false,
    })
  })

  it('pro vencido por 1 segundo → has_pro_access=false', async () => {
    const justBefore = new Date(NOW.getTime() - 1000).toISOString()
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'pro', plan_expires_at: justBefore, google_subscription_id: 'sub' },
        error: null,
      } },
    })
    const plan = await getUserPlanById(supabase, 'user-uuid')
    expect(plan.has_pro_access).toBe(false)
  })

  it('pro que vence en 1 segundo → has_pro_access=true', async () => {
    const justAfter = new Date(NOW.getTime() + 1000).toISOString()
    const supabase = createSupabaseMock({
      table: { user_profiles: {
        data: { plan: 'pro', plan_expires_at: justAfter, google_subscription_id: 'sub' },
        error: null,
      } },
    })
    const plan = await getUserPlanById(supabase, 'user-uuid')
    expect(plan.has_pro_access).toBe(true)
  })
})
