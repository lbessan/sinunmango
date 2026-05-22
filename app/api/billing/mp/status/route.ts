import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── GET /api/billing/mp/status ─────────────────────────────────────────────
//
// Devuelve el estado actual de la suscripción del user para la UI
// (configuracion/suscripcion). Incluye:
//   - plan: free | pro
//   - mp_status: pending | authorized | paused | cancelled | null
//   - plan_amount: 6999 (standard) | 3499 (early access)
//   - plan_renews_at: próxima fecha de cobro (o null si cancelado)
//   - plan_expires_at: hasta cuándo sigue Pro (para mostrar grace period)
//   - early_access + early_access_expires_at
//   - last_payments: últimos 3 cobros para mostrar historial chico
//
// Endpoint público para el user dueño solamente — RLS en payments + auth
// filtran por user_id.

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('plan, plan_period, plan_amount, plan_renews_at, plan_expires_at, mp_status, mp_preapproval_id, early_access, early_access_expires_at, subscribed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.error('[mp/status] profile error:', profileErr)
    return NextResponse.json({ error: 'No pudimos leer tu suscripción.' }, { status: 500 })
  }

  // Últimos 3 cobros (más recientes primero). RLS filtra por user_id auto.
  const { data: lastPayments } = await supabase
    .from('payments')
    .select('mp_payment_id, amount, currency, status, status_detail, created_at')
    .order('created_at', { ascending: false })
    .limit(3)

  return NextResponse.json({
    ok: true,
    plan:                    profile?.plan ?? 'free',
    plan_period:             profile?.plan_period ?? null,
    plan_amount:             profile?.plan_amount ?? null,
    plan_renews_at:          profile?.plan_renews_at ?? null,
    plan_expires_at:         profile?.plan_expires_at ?? null,
    mp_status:               profile?.mp_status ?? null,
    has_preapproval:         !!profile?.mp_preapproval_id,
    early_access:            profile?.early_access ?? false,
    early_access_expires_at: profile?.early_access_expires_at ?? null,
    subscribed_at:           profile?.subscribed_at ?? null,
    last_payments:           lastPayments ?? [],
  })
}
