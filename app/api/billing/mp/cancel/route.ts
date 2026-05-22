import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { pausePreapproval, MercadoPagoError } from '@/lib/mercadopago'

// ─── POST /api/billing/mp/cancel ────────────────────────────────────────────
//
// Cancela la suscripción del user (pausa el preapproval en MP).
//
// El user sigue siendo Pro hasta plan_expires_at (= la próxima fecha en la
// que MP iba a cobrar). Después degrada a Free. No reembolsamos el período
// vigente — el user pagó por el mes en curso y lo aprovecha completo.
//
// Idempotente: si el user ya está cancelado, devuelve 200 sin hacer nada.

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('mp_preapproval_id, mp_status, plan_expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile || !profile.mp_preapproval_id) {
    return NextResponse.json(
      { error: 'No tenés una suscripción activa para cancelar.' },
      { status: 404 },
    )
  }

  // Idempotente: si ya está pausado/cancelado, no llamamos a MP de nuevo.
  if (profile.mp_status === 'paused' || profile.mp_status === 'cancelled') {
    return NextResponse.json({
      ok:               true,
      already_cancelled: true,
      plan_expires_at:   profile.plan_expires_at,
    })
  }

  // Pausar en MP. 'paused' es lo que usamos para "el user canceló" — MP
  // deja de cobrar pero técnicamente se puede reactivar después con un
  // PUT status='authorized' (no expuesto al user todavía).
  try {
    await pausePreapproval(profile.mp_preapproval_id)
  } catch (err) {
    if (err instanceof MercadoPagoError) {
      console.error('[mp/cancel] MP error:', err.status, err.rawBody.slice(0, 500))
      return NextResponse.json(
        { error: 'No pudimos cancelar en MP. Probá de nuevo en un momento o cancelá desde tu cuenta de Mercado Pago.' },
        { status: 502 },
      )
    }
    console.error('[mp/cancel] unexpected:', err)
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }

  // Optimistic update — el webhook va a confirmar el cambio de estado
  // poco después. Pero queremos que el user vea el estado actualizado
  // inmediatamente sin esperar al evento.
  const { error: upErr } = await supabase
    .from('user_profiles')
    .update({ mp_status: 'paused' })
    .eq('user_id', user.id)

  if (upErr) {
    console.error('[mp/cancel] update profile error:', upErr)
    // Igual seguimos: el webhook va a reconciliar.
  }

  return NextResponse.json({
    ok:              true,
    plan_expires_at: profile.plan_expires_at,
    message:         profile.plan_expires_at
      ? `Tu suscripción está cancelada. Seguís Pro hasta el ${new Date(profile.plan_expires_at).toLocaleDateString('es-AR')}.`
      : 'Tu suscripción está cancelada.',
  })
}
