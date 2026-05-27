import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getUserPlan, getEffectivePlan } from '@/lib/subscription'
import { USAGE_LIMITS_FREE, type UsageFeature } from '@/lib/usage-limits'

// ─── GET /api/me ──────────────────────────────────────────────────────────────
// Devuelve info del usuario autenticado + su plan EFECTIVO (el del owner del
// workspace activo) + uso del mes actual.
// La app mobile lo llama al arrancar para saber si mostrar features premium.
// Auth: Bearer token (JWT) o cookie de sesión.
//
// Campos top-level reflejan el plan EFECTIVO — si el user es invitee en
// workspace ajeno, ven el plan del owner. Para casos donde necesitamos
// el plan propio (ej: /pro mostrando estado de billing personal),
// `own_plan` lo expone por separado.

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Plan efectivo (del workspace activo) y plan propio se piden en paralelo
  // porque getEffectivePlan internamente hace una llamada extra al admin
  // client cuando el user es invitee — paralelizarlo ahorra ~50ms.
  const [effective, ownPlan] = await Promise.all([
    getEffectivePlan(supabase, user),
    getUserPlan(supabase),
  ])

  // Uso del mes actual: el contador corre contra el USER ACTUAL (no contra
  // el owner), pero sólo se muestra cuando el plan efectivo es Free —
  // si el plan efectivo es Pro (propio o vía workspace ajeno), los cupos
  // no aplican.
  let usage: Record<UsageFeature, { used: number; limit: number; remaining: number }> | null = null
  if (!effective.has_pro_access) {
    const { data } = await supabase.rpc('get_all_usage')
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
    id:                user.id,
    email:             user.email,
    // Plan EFECTIVO (workspace activo). Esto es lo que la UI debe usar para
    // decidir si mostrar features Pro / cupos.
    plan:              effective.plan,
    has_pro_access:    effective.has_pro_access,
    plan_expires_at:   effective.plan_expires_at,
    plan_source:       effective.source,       // 'own' | 'workspace_share'
    plan_owner_email:  effective.ownerEmail,   // email del owner si workspace ajeno
    // Plan PROPIO del user (independiente del workspace activo). Útil en /pro
    // para mostrar al user el estado de su billing personal — distinto del
    // plan efectivo cuando es invitee Pro-via-share en workspace ajeno.
    own_plan: {
      plan:            ownPlan.plan,
      has_pro_access:  ownPlan.has_pro_access,
      plan_expires_at: ownPlan.plan_expires_at,
    },
    usage,  // null si efectivo es Pro (ilimitado), objeto si es Free
  })
}

function buildUsage(feature: UsageFeature, used: Record<string, number>) {
  const u     = used[feature] ?? 0
  const limit = USAGE_LIMITS_FREE[feature]
  return { used: u, limit, remaining: Math.max(0, limit - u) }
}
