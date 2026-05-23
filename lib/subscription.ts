import 'server-only'
import { adminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'grandfathered'

export type UserPlan = {
  plan:            Plan
  plan_expires_at: string | null  // ISO string o null
  has_pro_access:  boolean        // true si grandfathered o pro vigente
}

const DEFAULT_PLAN: UserPlan = {
  plan:            'free',
  plan_expires_at: null,
  has_pro_access:  false,
}

// ─── User-scoped: leer plan del usuario actual ───────────────────────────────

/**
 * Obtiene el plan del usuario actual usando el cliente Supabase autenticado.
 * RLS filtra a la fila del propio user, no hace falta pasar userId.
 *
 * Usar desde routes que ya tienen el cliente del helper createClientForRequest.
 */
export async function getUserPlan(supabase: SupabaseClient<Database>): Promise<UserPlan> {
  const { data } = await supabase
    .from('user_profiles')
    .select('plan, plan_expires_at')
    .maybeSingle()

  if (!data) return DEFAULT_PLAN

  const plan    = (data.plan ?? 'free') as Plan
  const expires = data.plan_expires_at as string | null
  const has_pro_access =
    plan === 'grandfathered' ||
    (plan === 'pro' && (!expires || new Date(expires) > new Date()))

  return {
    plan,
    plan_expires_at: expires,
    has_pro_access,
  }
}

// ─── Admin: leer plan por userId (para webhooks sin sesión) ──────────────────

/**
 * Variante de getUserPlan para contextos sin sesión (webhooks Resend, MP, etc).
 * Requiere adminClient. Filtra por user_id explícito en lugar de depender de RLS.
 */
export async function getUserPlanById(
  admin:  SupabaseClient<Database>,
  userId: string,
): Promise<UserPlan> {
  const { data } = await admin
    .from('user_profiles')
    .select('plan, plan_expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return DEFAULT_PLAN

  const plan    = (data.plan ?? 'free') as Plan
  const expires = data.plan_expires_at as string | null
  const has_pro_access =
    plan === 'grandfathered' ||
    (plan === 'pro' && (!expires || new Date(expires) > new Date()))

  return {
    plan,
    plan_expires_at: expires,
    has_pro_access,
  }
}

// ─── Admin: actualizar plan (llamado desde webhooks de billing) ──────────────

/**
 * Actualiza el plan de un usuario desde un webhook de billing (Mercado Pago).
 * Usa adminClient (service role) porque los webhooks no tienen sesión de usuario.
 *
 * Nota: el webhook de MP en /api/webhooks/mp hace su propio update directamente
 * a user_profiles porque necesita guardar también mp_status, plan_renews_at,
 * mp_payer_id, etc. Esta función queda para usos más simples (legacy o futuros).
 */
export async function updateUserPlan(
  userId: string,
  plan: Plan,
  opts?: { plan_expires_at?: string | null }
) {
  const { error } = await adminClient
    .from('user_profiles')
    .update({
      plan,
      plan_expires_at: opts?.plan_expires_at ?? null,
    })
    .eq('user_id', userId)

  if (error) throw new Error(`[updateUserPlan] ${error.message}`)
}
