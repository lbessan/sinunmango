import 'server-only'
import { adminClient } from '@/lib/supabase/admin'
import { getCurrentWorkspace } from '@/lib/workspace'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'grandfathered'

export type UserPlan = {
  plan:            Plan
  plan_expires_at: string | null  // ISO string o null
  has_pro_access:  boolean        // true si grandfathered o pro vigente
}

/**
 * Plan efectivo aplicado en un contexto operativo. El plan que cuenta es el
 * del owner del workspace ACTIVO — si estoy en workspace propio, es mi plan;
 * si soy invitee en un workspace ajeno, es el plan del owner.
 *
 * Esto es lo que se usa en endpoints "Pro-gated" (parsear-resumen,
 * leer-ticket, analitica-insight, etc) — el invitee con Pro efectivo
 * (porque accede vía un owner Pro) tiene las mismas features que si
 * fuera Pro propio.
 *
 * Excepciones donde NO se usa effective plan:
 *   - Crear share (/api/shares POST): siempre plan del actor, porque el
 *     share es sobre sus propios datos.
 *   - Manguito (asistente): bloqueado para invitees por privacidad de
 *     los datos del owner — no aplica plan efectivo.
 */
export type EffectivePlan = UserPlan & {
  /** 'own': el user está en su propio workspace.
   *  'workspace_share': el user es invitee del workspace activo. */
  source:      'own' | 'workspace_share'
  /** Si source === 'workspace_share', el email del owner para mostrar
   *  badges tipo "Pro vía owner@example.com". Null sino. */
  ownerEmail:  string | null
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

// ─── Effective plan: el del owner del workspace activo ──────────────────────
//
// Para endpoints "Pro-gated" donde el invitee debe recibir las mismas
// features que el owner que paga. Si el user está en su propio workspace,
// se reduce a getUserPlan; si es invitee en workspace ajeno, lee el plan
// del owner via admin.
//
// NO usar este helper en:
//   - Crear share (/api/shares POST): el plan que importa es del actor
//     porque está disponiendo de SUS propios datos.
//   - Webhooks/crons sin sesión: usar getUserPlanById directo.
//
// Cuotas: Pro es ilimitado, así que cuando el plan efectivo es Pro NO
// se cuenta cupo de nadie. Cuando es Free, el cupo se cuenta contra el
// USER ACTUAL (no contra el owner). Esto es una simplificación porque
// hoy compartir es Pro-only — si A es Free, A no creó shares activos
// salvo que su Pro haya expirado después (caso edge tolerable).
export async function getEffectivePlan(
  supabase: SupabaseClient<Database>,
  user:     Pick<User, 'id'>,
): Promise<EffectivePlan> {
  const workspace = await getCurrentWorkspace(user.id)

  if (workspace.isOwn) {
    const plan = await getUserPlan(supabase)
    return { ...plan, source: 'own', ownerEmail: null }
  }

  // Workspace ajeno → leer plan del owner via admin client (RLS bloquearía
  // el read directo desde el cliente del invitee).
  const ownerPlan = await getUserPlanById(adminClient, workspace.ownerUserId)
  return {
    ...ownerPlan,
    source:     'workspace_share',
    ownerEmail: workspace.ownerEmail ?? null,
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
