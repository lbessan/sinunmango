import { adminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'grandfathered'

export type UserPlan = {
  plan:                    Plan
  plan_expires_at:         string | null  // ISO string o null
  google_subscription_id:  string | null
  has_pro_access:          boolean        // true si es grandfathered o pro vigente
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el plan del usuario desde user_profiles.
 * Usa el adminClient (service role) así funciona tanto en API routes como en server components.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const { data } = await adminClient
    .from('user_profiles')
    .select('plan, plan_expires_at, google_subscription_id')
    .eq('user_id', userId)
    .single()

  if (!data) {
    // Si por alguna razón no hay perfil, tratar como free sin acceso
    return { plan: 'free', plan_expires_at: null, google_subscription_id: null, has_pro_access: false }
  }

  const plan = (data.plan ?? 'free') as Plan
  const expires = data.plan_expires_at as string | null
  const has_pro_access =
    plan === 'grandfathered' ||
    (plan === 'pro' && (!expires || new Date(expires) > new Date()))

  return {
    plan,
    plan_expires_at:        expires,
    google_subscription_id: data.google_subscription_id as string | null,
    has_pro_access,
  }
}

/**
 * Versión rápida: solo retorna true/false.
 * Ideal para guards en API routes.
 */
export async function hasProAccess(userId: string): Promise<boolean> {
  const { plan } = await getUserPlan(userId)
  if (plan === 'grandfathered') return true
  if (plan !== 'pro') return false
  const { data } = await adminClient
    .from('user_profiles')
    .select('plan_expires_at')
    .eq('user_id', userId)
    .single()
  const expires = data?.plan_expires_at as string | null
  return !expires || new Date(expires) > new Date()
}

/**
 * Actualiza el plan de un usuario. Llamado desde el webhook de Google Play.
 */
export async function updateUserPlan(
  userId: string,
  plan: Plan,
  opts?: {
    plan_expires_at?:      string | null
    google_purchase_token?: string | null
    google_subscription_id?: string | null
  }
) {
  const { error } = await adminClient
    .from('user_profiles')
    .update({
      plan,
      plan_expires_at:        opts?.plan_expires_at       ?? null,
      google_purchase_token:  opts?.google_purchase_token ?? null,
      google_subscription_id: opts?.google_subscription_id ?? null,
    })
    .eq('user_id', userId)

  if (error) throw new Error(`[updateUserPlan] ${error.message}`)
}
