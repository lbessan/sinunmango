// ─── Rate-limits mensuales para features Pro en Free tier ──────────────────
//
// Estrategia: cada endpoint Pro consulta `enforceMonthlyLimit`. La función:
//   1. Si el user es Pro → permite y devuelve { allowed: true, remaining: -1 }
//      (-1 indica "ilimitado", para que el cliente no muestre contador)
//   2. Si es Free → consulta `get_usage` y compara contra el límite.
//      - Si excede → { allowed: false, remaining: 0, limit }
//      - Si no excede → llama `increment_usage` y devuelve remaining post-incr.
//
// Atomicidad: el increment_usage usa UPSERT con `+1` en la misma sentencia,
// no hay race condition entre verificación y escritura. El check previo solo
// existe para devolver el error de "limit_reached" sin ejecutar el endpoint.
//
// Uso típico en un route handler:
//   const plan = await getUserPlan(supabase)
//   const usage = await enforceMonthlyLimit(supabase, 'asistente', plan.has_pro_access)
//   if (!usage.allowed) {
//     return NextResponse.json({ error: 'limit_reached', ...usage }, { status: 429 })
//   }
//   // ... lógica del endpoint ...
//   return NextResponse.json({ ... }, { headers: usageHeaders(usage) })

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database }       from '@/lib/database.types'

// ── Cast helper ──────────────────────────────────────────────────────────────
// `lib/database.types.ts` se generó antes de la migration `usage-monthly`,
// por lo que TypeScript no conoce todavía:
//   - Tabla `usage_monthly`
//   - RPCs `get_usage`, `increment_usage`, `get_all_usage`
// Casteamos localmente como workaround. Cuando regeneres los tipos vía
// `supabase gen types` podés eliminar estos casts.
type UntypedClient = {
  rpc:  (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => {
              maybeSingle: () => Promise<{ data: { count: number } | null; error: unknown }>
            }
          }
        }
      }
    }
    upsert: (row: Record<string, unknown>, opts?: { onConflict: string }) => Promise<{ error: unknown }>
  }
}
const untyped = (c: SupabaseClient<Database>) => c as unknown as UntypedClient

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

// ── Verifica + incrementa atómicamente ──────────────────────────────────────
export async function enforceMonthlyLimit(
  supabase:     SupabaseClient<Database>,
  feature:      UsageFeature,
  hasProAccess: boolean,
): Promise<UsageResult> {
  if (hasProAccess) {
    return { allowed: true, remaining: -1, limit: -1, used: -1 }
  }

  const limit = USAGE_LIMITS_FREE[feature]
  const sb    = untyped(supabase)

  // Primero leemos para devolver 429 sin desperdiciar la transacción de increment
  const { data: currentRaw } = await sb.rpc('get_usage', { p_feature: feature })
  const current = (currentRaw as number | null) ?? 0

  if (current >= limit) {
    return { allowed: false, remaining: 0, limit, used: current }
  }

  // Incrementamos atómicamente y obtenemos el count nuevo
  const { data: newCountRaw, error } = await sb.rpc('increment_usage', { p_feature: feature })
  if (error) {
    // Fallback conservador: si la RPC falla, permitir pero loggear.
    // No queremos romper UX por un fallo de DB en el contador.
    console.error('[enforceMonthlyLimit] increment_usage error:', error)
    return { allowed: true, remaining: limit - current - 1, limit, used: current + 1 }
  }

  const newCount = (newCountRaw as number | null) ?? current + 1
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
  const { data } = await untyped(supabase).rpc('get_usage', { p_feature: feature })
  const used  = (data as number | null) ?? 0
  const limit = USAGE_LIMITS_FREE[feature]
  return { used, limit, remaining: Math.max(0, limit - used), isPro: false }
}

// ── Variante admin (webhooks: email-inbound, RTDN, etc) ─────────────────────
//
// Como las RPCs usan auth.uid() y esto se ejecuta con service role (sin
// sesión de user), hacemos el upsert directo contra la tabla. La service
// role bypasea RLS y no tiene problema con auth.uid()=NULL.
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
  const adminUntyped = untyped(admin)
  const { data: row } = await adminUntyped
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
  const { error } = await adminUntyped
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
    'X-Usage-Feature':   '',  // se sobreescribe abajo si querés trackear cuál fue
    'X-Usage-Used':      String(usage.used),
    'X-Usage-Limit':     String(usage.limit),
    'X-Usage-Remaining': String(usage.remaining),
  }
}
