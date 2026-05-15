// ─── Rate-limits mensuales para features Pro en Free tier ──────────────────
//
// Patrón check + commit: el cupo se consume SOLO si la operación fue exitosa.
//
// Uso típico en un route handler:
//   const plan  = await getUserPlan(supabase)
//   const usage = await checkMonthlyLimit(supabase, 'asistente', plan.has_pro_access)
//   if (!usage.allowed) {
//     return NextResponse.json({ error: 'limit_reached', ...usage }, { status: 429 })
//   }
//   // ... lógica del endpoint ...
//   const res = await fetch('https://api.anthropic.com/...')
//   if (!res.ok) return NextResponse.json({ error: '...' }, { status: 502 })
//
//   // SOLO acá, después de saber que la operación fue exitosa, consumimos cupo
//   const committed = await commitMonthlyUsage(supabase, 'asistente', plan.has_pro_access)
//   return NextResponse.json({ ... }, { headers: usageHeaders(committed) })

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database }       from '@/lib/database.types'

// ── Configuración de límites ─────────────────────────────────────────────────
export const USAGE_LIMITS_FREE = {
  asistente:    5,
  ticket:       3,
  resumen:      1,
  mail_tarjeta: 1,
} as const

export type UsageFeature = keyof typeof USAGE_LIMITS_FREE

export type UsageResult =
  | { allowed: true;  remaining: number; limit: number; used: number }   // Free OK
  | { allowed: true;  remaining: -1;     limit: -1;     used: -1 }       // Pro
  | { allowed: false; remaining: 0;      limit: number; used: number }   // Free agotado

// ── Solo CHEQUEA (no incrementa) ────────────────────────────────────────────
// Devuelve si el user puede ejecutar la operación. NO consume cupo.
// Si la operación falla después, no hay que rollback porque nada se consumió.
export async function checkMonthlyLimit(
  supabase:     SupabaseClient<Database>,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<UsageResult> {
  if (hasProAccess) {
    return { allowed: true, remaining: -1, limit: -1, used: -1 }
  }

  const limit = USAGE_LIMITS_FREE[feature]
  const { data: currentRaw } = await supabase.rpc('get_usage', { p_feature: feature })
  const current = currentRaw ?? 0

  if (current >= limit) {
    return { allowed: false, remaining: 0, limit, used: current }
  }
  return { allowed: true, remaining: limit - current, limit, used: current }
}

// ── COMMIT: incrementa el contador (operación exitosa) ─────────────────────
// Se llama DESPUÉS de que la operación principal fue exitosa. Si esto falla,
// la operación ya está hecha — solo log y seguir (preferimos no romper UX).
export async function commitMonthlyUsage(
  supabase:     SupabaseClient<Database>,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<UsageResult> {
  if (hasProAccess) {
    return { allowed: true, remaining: -1, limit: -1, used: -1 }
  }

  const limit = USAGE_LIMITS_FREE[feature]
  const { data: newCountRaw, error } = await supabase.rpc('increment_usage', { p_feature: feature })

  if (error) {
    console.error('[commitMonthlyUsage] increment_usage error:', error)
    // Devolvemos algo razonable aunque el counter no se haya incrementado
    return { allowed: true, remaining: limit - 1, limit, used: 1 }
  }

  const newCount = newCountRaw ?? 1
  return {
    allowed:   true,
    remaining: Math.max(0, limit - newCount),
    limit,
    used:      newCount,
  }
}

// ── Solo leer (sin incrementar) ──────────────────────────────────────────────
// Útil para mostrar contadores en UI antes de la acción.
export async function readMonthlyUsage(
  supabase:     SupabaseClient<Database>,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<{ used: number; limit: number; remaining: number; isPro: boolean }> {
  if (hasProAccess) {
    return { used: 0, limit: -1, remaining: -1, isPro: true }
  }
  const { data } = await supabase.rpc('get_usage', { p_feature: feature })
  const used  = data ?? 0
  const limit = USAGE_LIMITS_FREE[feature]
  return { used, limit, remaining: Math.max(0, limit - used), isPro: false }
}

// ── Solo CHECK con service_role (no incrementa) ──────────────────────────────
// Para webhooks que quieren chequear cupo ANTES de hacer trabajo caro (ej:
// llamar a Claude) sin consumir todavía. Después, si el trabajo fue exitoso,
// usar enforceMonthlyLimitAsAdmin (atomic check+commit) para incrementar.
//
// Hay una pequeña ventana de race entre este check y el commit: dos webhooks
// concurrentes pueden ambos pasar el check y llamar a Claude, pero solo uno
// consigue commitear (el otro será rechazado por la RPC atómica). Costo:
// 1 llamada a Claude desperdiciada. Aceptable.
export async function checkMonthlyUsageAsAdmin(
  admin:        SupabaseClient<Database>,
  userId:       string,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<UsageResult> {
  if (hasProAccess) {
    return { allowed: true, remaining: -1, limit: -1, used: -1 }
  }

  const limit = USAGE_LIMITS_FREE[feature]
  const ar    = new Date(Date.now() - 3 * 60 * 60 * 1000)   // AR fija UTC-3
  const year  = ar.getUTCFullYear()
  const month = ar.getUTCMonth() + 1

  const { data: row } = await admin
    .from('usage_monthly')
    .select('count')
    .eq('user_id', userId)
    .eq('year',    year)
    .eq('month',   month)
    .eq('feature', feature)
    .maybeSingle()

  const used = row?.count ?? 0
  if (used >= limit) {
    return { allowed: false, remaining: 0, limit, used }
  }
  return { allowed: true, remaining: limit - used, limit, used }
}

// ── Variante admin (webhooks: email-inbound, RTDN, etc) ─────────────────────
//
// Los webhooks corren con service_role y no tienen sesión de user, así que
// no pueden usar las RPCs que dependen de auth.uid(). Llamamos a la RPC
// `increment_usage_admin` que encapsula check + commit en una sola
// transacción atómica con SELECT FOR UPDATE — previene la race condition
// que tenía la versión vieja (SELECT + UPSERT desde JS).
//
// p_limit < 0 indica Pro (sin tope). La RPC siempre incrementa para Pro y
// devuelve { allowed: true, used: nuevo_count }.
export async function enforceMonthlyLimitAsAdmin(
  admin:        SupabaseClient<Database>,
  userId:       string,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<UsageResult> {
  const limit  = USAGE_LIMITS_FREE[feature]
  const pLimit = hasProAccess ? -1 : limit

  const { data, error } = await admin.rpc('increment_usage_admin', {
    p_user_id: userId,
    p_feature: feature,
    p_limit:   pLimit,
  })

  if (error || !data) {
    console.error('[enforceMonthlyLimitAsAdmin] RPC error:', error)
    // Fallback fail-open: no consumimos cupo y permitimos. Los webhooks
    // suelen reintentar; preferimos cobrar un mail de más antes que
    // rechazarlo silenciosamente por un error transitorio de la RPC.
    if (hasProAccess) return { allowed: true, remaining: -1, limit: -1, used: -1 }
    return { allowed: true, remaining: limit, limit, used: 0 }
  }

  // La RPC retorna JSONB; database.types lo tipa como Json genérico.
  // Sabemos el shape porque lo definimos en docs/migration-usage-admin-atomic.sql.
  const { allowed, used } = data as { allowed: boolean; used: number }
  if (hasProAccess) {
    return { allowed: true, remaining: -1, limit: -1, used: -1 }
  }
  if (!allowed) {
    return { allowed: false, remaining: 0, limit, used }
  }
  return {
    allowed:   true,
    remaining: Math.max(0, limit - used),
    limit,
    used,
  }
}

// ── Headers para que el cliente actualice contadores ─────────────────────────
export function usageHeaders(usage: UsageResult): Record<string, string> {
  if (usage.limit === -1) return {}  // Pro: no mandamos headers
  return {
    'X-Usage-Used':      String(usage.used),
    'X-Usage-Limit':     String(usage.limit),
    'X-Usage-Remaining': String(usage.remaining),
  }
}
