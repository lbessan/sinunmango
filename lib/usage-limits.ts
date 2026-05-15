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

// ── Variante admin (webhooks: email-inbound, RTDN, etc) ─────────────────────
//
// Como las RPCs usan auth.uid() y esto se ejecuta con service role (sin
// sesión de user), hacemos el upsert directo contra la tabla. La service
// role bypasea RLS y no tiene problema con auth.uid()=NULL.
//
// Acá mantenemos el patrón check+commit en una sola función porque el
// webhook de email es asíncrono y no tiene sentido separarlo.
export async function enforceMonthlyLimitAsAdmin(
  admin:        SupabaseClient<Database>,
  userId:       string,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<UsageResult> {
  if (hasProAccess) {
    return { allowed: true, remaining: -1, limit: -1, used: -1 }
  }

  const limit = USAGE_LIMITS_FREE[feature]
  const now   = new Date()
  // today_ar(): Argentina no tiene DST, UTC-3 fijo
  const ar    = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const year  = ar.getUTCFullYear()
  const month = ar.getUTCMonth() + 1

  // Leer current
  const { data: row } = await admin
    .from('usage_monthly')
    .select('count')
    .eq('user_id', userId)
    .eq('year',    year)
    .eq('month',   month)
    .eq('feature', feature)
    .maybeSingle()

  const current = row?.count ?? 0
  if (current >= limit) {
    return { allowed: false, remaining: 0, limit, used: current }
  }

  // Upsert con +1
  const newCount = current + 1
  const { error } = await admin
    .from('usage_monthly')
    .upsert(
      { user_id: userId, year, month, feature, count: newCount },
      { onConflict: 'user_id,year,month,feature' },
    )

  if (error) {
    console.error('[enforceMonthlyLimitAsAdmin] upsert error:', error)
    return { allowed: true, remaining: limit - newCount, limit, used: newCount }
  }

  return {
    allowed:   true,
    remaining: Math.max(0, limit - newCount),
    limit,
    used:      newCount,
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
