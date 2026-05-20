import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── POST /api/me/restore ─────────────────────────────────────────────────────
//
// Recupera una cuenta que fue marcada para eliminación (deleted_at NOT NULL)
// dentro del grace period de 30 días. Si el cron ya purgó la cuenta, no hay
// nada que restaurar — ese user_id ya no existe en auth.users.
//
// Flow del user:
//   1. User eliminó cuenta hace < 30 días.
//   2. Vuelve a la app y se loguea (auth.users sigue existiendo).
//   3. Middleware detecta user_profiles.deleted_at NOT NULL → muestra
//      pantalla "Tu cuenta está pendiente de eliminación, ¿la recuperás?"
//   4. User toca Recuperar → POST /api/me/restore → deleted_at = NULL.
//   5. Redirect a /dashboard como user activo normal.

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Solo restauramos si la cuenta está marcada como deleted (no si está activa).
  // Esto previene "restores" accidentales o redundantes.
  const { data: profile, error: profErr } = await supabase
    .from('user_profiles')
    .select('deleted_at')
    .eq('user_id', user.id)
    .single()

  if (profErr || !profile) {
    return NextResponse.json(
      { error: 'No encontramos tu perfil.' },
      { status: 404 },
    )
  }

  if (!profile.deleted_at) {
    // No estaba marcada — no hay nada que restaurar. Devolvemos OK
    // idempotente para que el cliente pueda llamar sin chequear estado.
    return NextResponse.json({ ok: true, was_deleted: false })
  }

  const { error: upErr } = await supabase
    .from('user_profiles')
    .update({ deleted_at: null })
    .eq('user_id', user.id)

  if (upErr) {
    console.error('[me/restore] update error:', upErr)
    return NextResponse.json(
      { error: 'No pudimos restaurar tu cuenta. Intentá de nuevo.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    was_deleted: true,
    message: 'Tu cuenta fue restaurada.',
  })
}
