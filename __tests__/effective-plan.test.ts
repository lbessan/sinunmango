// Tests para getEffectivePlan en lib/subscription.ts
//
// El effective plan es el plan del OWNER del workspace activo:
//   - Workspace propio (isOwn) → mi plan (vía getUserPlan).
//   - Workspace ajeno → plan del owner (vía getUserPlanById sobre admin).
//
// El source se expone para que la UI pueda mostrar "Pro vía workspace de X"
// cuando aplica.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks hoisted: necesitamos controlar lo que devuelven workspace + plans.
const { getCurrentWorkspaceMock, adminFromMock } = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  adminFromMock: vi.fn(),
}))

vi.mock('@/lib/workspace', () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  adminClient: { from: adminFromMock },
}))

import { getEffectivePlan } from '@/lib/subscription'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const ME    = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'

// Builder para el supabase del user actual (chequea user_profiles propio).
function buildSupabase(propio: { plan: string; plan_expires_at: string | null } | null): SupabaseClient<Database> {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: propio, error: null })),
      })),
    })),
  } as unknown as SupabaseClient<Database>
}

// Builder para el admin client cuando consulta el plan del owner.
function setAdminOwnerPlan(plan: { plan: string; plan_expires_at: string | null } | null) {
  adminFromMock.mockImplementationOnce(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: plan, error: null })),
      })),
    })),
  }))
}

beforeEach(() => {
  getCurrentWorkspaceMock.mockReset()
  adminFromMock.mockReset()
})

describe('getEffectivePlan — workspace propio', () => {
  it('isOwn → devuelve plan del user (Free)', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({ ownerUserId: ME, isOwn: true })
    const supabase = buildSupabase({ plan: 'free', plan_expires_at: null })

    const result = await getEffectivePlan(supabase, { id: ME })
    expect(result.source).toBe('own')
    expect(result.ownerEmail).toBeNull()
    expect(result.plan).toBe('free')
    expect(result.has_pro_access).toBe(false)
  })

  it('isOwn → Pro vigente devuelve has_pro_access true', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({ ownerUserId: ME, isOwn: true })
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const supabase = buildSupabase({ plan: 'pro', plan_expires_at: future })

    const result = await getEffectivePlan(supabase, { id: ME })
    expect(result.source).toBe('own')
    expect(result.plan).toBe('pro')
    expect(result.has_pro_access).toBe(true)
  })

  it('isOwn → Pro vencido NO tiene acceso', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({ ownerUserId: ME, isOwn: true })
    const past = '2020-01-01T00:00:00Z'
    const supabase = buildSupabase({ plan: 'pro', plan_expires_at: past })

    const result = await getEffectivePlan(supabase, { id: ME })
    expect(result.plan).toBe('pro')
    expect(result.has_pro_access).toBe(false)
  })
})

describe('getEffectivePlan — workspace ajeno (invitee)', () => {
  it('invitee + owner Pro → effective Pro con source=workspace_share', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({
      ownerUserId: OWNER, isOwn: false, ownerEmail: 'owner@x.com',
    })
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
    setAdminOwnerPlan({ plan: 'pro', plan_expires_at: future })
    // El supabase del user (Free) no debería consultarse acá — sólo el admin
    const supabase = buildSupabase({ plan: 'free', plan_expires_at: null })

    const result = await getEffectivePlan(supabase, { id: ME })
    expect(result.source).toBe('workspace_share')
    expect(result.ownerEmail).toBe('owner@x.com')
    expect(result.plan).toBe('pro')
    expect(result.has_pro_access).toBe(true)
  })

  it('invitee + owner Free → effective Free', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({
      ownerUserId: OWNER, isOwn: false, ownerEmail: 'owner@x.com',
    })
    setAdminOwnerPlan({ plan: 'free', plan_expires_at: null })
    const supabase = buildSupabase({ plan: 'pro', plan_expires_at: '2030-01-01T00:00:00Z' })

    const result = await getEffectivePlan(supabase, { id: ME })
    // Aunque el invitee TENGA Pro propio, en el workspace ajeno aplica el
    // plan del owner (Free). Coherente con "Pro es por workspace".
    expect(result.plan).toBe('free')
    expect(result.has_pro_access).toBe(false)
  })

  it('invitee + owner sin profile → effective Free (default)', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({
      ownerUserId: OWNER, isOwn: false, ownerEmail: null,
    })
    setAdminOwnerPlan(null)
    const supabase = buildSupabase({ plan: 'free', plan_expires_at: null })

    const result = await getEffectivePlan(supabase, { id: ME })
    expect(result.has_pro_access).toBe(false)
    expect(result.ownerEmail).toBeNull()
  })

  it('invitee + owner grandfathered → effective Pro (sin venc)', async () => {
    getCurrentWorkspaceMock.mockResolvedValueOnce({
      ownerUserId: OWNER, isOwn: false, ownerEmail: 'g@x.com',
    })
    setAdminOwnerPlan({ plan: 'grandfathered', plan_expires_at: null })
    const supabase = buildSupabase({ plan: 'free', plan_expires_at: null })

    const result = await getEffectivePlan(supabase, { id: ME })
    expect(result.plan).toBe('grandfathered')
    expect(result.has_pro_access).toBe(true)
  })
})
