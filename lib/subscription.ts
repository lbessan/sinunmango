import { adminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'grandfathered'

export type UserPlan = {
  plan:                   Plan
  plan_expires_at:        string | null  // ISO string o null
  google_subscription_id: string | null
  has_pro_access:         boolean        // true si grandfathered o pro vigente
}

const DEFAULT_PLAN: UserPlan = {
  plan:                   'free',
  plan_expires_at:        null,
  google_subscription_id: null,
  has_pro_access:         false,
}

// ─── User-scoped: leer plan del usuario actual ───────────────────────────────

/**
 * Obtiene el plan del usuario actual usando el cliente Supabase autenticado.
 * RLS filtra a la fila del propio user, no hace falta pasar userId.
 *
 * Usar desde routes que ya tienen el cliente del helper createClientForRequest.
 */
export async function getUserPlan(supabase: SupabaseClient): Promise<UserPlan> {
  const { data } = await supabase
    .from('user_profiles')
    .select('plan, plan_expires_at, google_subscription_id')
    .maybeSingle()

  if (!data) return DEFAULT_PLAN

  const plan    = (data.plan ?? 'free') as Plan
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

// ─── Admin: actualizar plan (llamado solo desde webhooks) ────────────────────

/**
 * Actualiza el plan de un usuario desde el webhook de Google Play.
 * Usa adminClient (service role) porque el webhook no tiene sesión de usuario
 * — Google nos manda la notificación con el userId en obfuscatedExternalAccountId.
 */
export async function updateUserPlan(
  userId: string,
  plan: Plan,
  opts?: {
    plan_expires_at?:        string | null
    google_purchase_token?:  string | null
    google_subscription_id?: string | null
  }
) {
  const { error } = await adminClient
    .from('user_profiles')
    .update({
      plan,
      plan_expires_at:        opts?.plan_expires_at        ?? null,
      google_purchase_token:  opts?.google_purchase_token  ?? null,
      google_subscription_id: opts?.google_subscription_id ?? null,
    })
    .eq('user_id', userId)

  if (error) throw new Error(`[updateUserPlan] ${error.message}`)
}
