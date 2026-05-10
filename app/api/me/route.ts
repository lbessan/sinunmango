import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getUserPlan } from '@/lib/subscription'

// ─── GET /api/me ──────────────────────────────────────────────────────────────
// Devuelve info del usuario autenticado + su plan de suscripción.
// La app mobile lo llama al arrancar para saber si mostrar features premium.
// Auth: Bearer token (JWT) o cookie de sesión.

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const planInfo = await getUserPlan(supabase)

  return NextResponse.json({
    id:              user.id,
    email:           user.email,
    plan:            planInfo.plan,
    has_pro_access:  planInfo.has_pro_access,
    plan_expires_at: planInfo.plan_expires_at,
  })
}
