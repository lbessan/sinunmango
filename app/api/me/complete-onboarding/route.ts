import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── POST /api/me/complete-onboarding ────────────────────────────────────────
//
// Marca user_profiles.onboarding_completed_at = NOW(). Es idempotente:
// llamarlo dos veces no rompe nada (no actualizamos si ya está seteado).
//
// Mientras el flag esté NULL, los endpoints sensibles a cupo
// (parsear-tarjeta-pdf, parsear-resumen) no consumen contador. Esto permite
// que el user pruebe la importación del PDF de resumen en el step 2 del
// onboarding sin agotar el 1/1 de Free.

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // No sobreescribir si ya estaba completado — evita resetear el timestamp
  // si el endpoint se llama de nuevo por accidente desde el client.
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('onboarding_completed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.onboarding_completed_at) {
    return NextResponse.json({
      ok: true,
      already_completed: true,
      onboarding_completed_at: existing.onboarding_completed_at,
    })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_profiles')
    .update({ onboarding_completed_at: now })
    .eq('user_id', user.id)

  if (error) {
    console.error('[me/complete-onboarding] update error:', error)
    return NextResponse.json(
      { error: 'No pudimos guardar el estado del onboarding.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, onboarding_completed_at: now })
}
