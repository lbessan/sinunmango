import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getUserPlan } from '@/lib/subscription'
import { USAGE_LIMITS_FREE, type UsageFeature } from '@/lib/usage-limits'

// ─── GET /api/me ──────────────────────────────────────────────────────────────
// Devuelve info del usuario autenticado + su plan + uso del mes actual.
// La app mobile lo llama al arrancar para saber si mostrar features premium.
// Auth: Bearer token (JWT) o cookie de sesión.

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const planInfo = await getUserPlan(supabase)

  // Uso del mes actual (solo relevante si NO es Pro)
  let usage: Record<UsageFeature, { used: number; limit: number; remaining: number }> | null = null
  if (!planInfo.has_pro_access) {
    // Cast: los tipos generados de Supabase no conocen la RPC `get_all_usage`
    // todavía. Regenerar `lib/database.types.ts` después de correr la migration
    // `usage-monthly.sql` para eliminar este cast.
    const { data } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: Array<{ feature: string; count: number }> | null }>)('get_all_usage')
    const usedByFeature: Record<string, number> = {}
    for (const row of (data ?? [])) {
      usedByFeature[row.feature] = row.count
    }
    usage = {
      asistente:    buildUsage('asistente',    usedByFeature),
      ticket:       buildUsage('ticket',       usedByFeature),
      resumen:      buildUsage('resumen',      usedByFeature),
      mail_tarjeta: buildUsage('mail_tarjeta', usedByFeature),
    }
  }

  return NextResponse.json({
    id:              user.id,
    email:           user.email,
    plan:            planInfo.plan,
    has_pro_access:  planInfo.has_pro_access,
    plan_expires_at: planInfo.plan_expires_at,
    usage,  // null si es Pro (ilimitado), objeto si es Free
  })
}

function buildUsage(feature: UsageFeature, used: Record<string, number>) {
  const u     = used[feature] ?? 0
  const limit = USAGE_LIMITS_FREE[feature]
  return { used: u, limit, remaining: Math.max(0, limit - u) }
}
