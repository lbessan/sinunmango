import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── POST /api/me/delete ─────────────────────────────────────────────────────
//
// Inicia el flow de soft delete de la cuenta del user autenticado.
//
//   1. Marca user_profiles.deleted_at = NOW().
//   2. signOut() para invalidar la sesión actual.
//   3. El cron /api/cron/purge-deleted-users hace el hard delete cascade
//      después del grace period de 30 días.
//
// Si el user vuelve a loguear dentro del grace period, el middleware lo
// detecta y le ofrece recuperar la cuenta (POST /api/me/restore).
//
// Defensa contra accidentes: el body debe contener `confirm: "ELIMINAR"`.
// La UI obliga al user a tipear esa palabra antes de enviar. No es defensa
// contra atacante con sesión hijackeada — pero ese es escenario distinto.

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { confirm?: string } = {}
  try {
    body = await req.json()
  } catch {
    // body vacío o inválido — caemos al check de confirm más abajo
  }

  if (body.confirm !== 'ELIMINAR') {
    return NextResponse.json(
      { error: 'Confirmación requerida. Tipeá "ELIMINAR" para confirmar.' },
      { status: 400 },
    )
  }

  // Marcar como soft-deleted. RLS asegura que solo el dueño puede tocar
  // su propia row (policy en user_profiles.user_id = auth.uid()).
  const { error: upErr } = await supabase
    .from('user_profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (upErr) {
    console.error('[me/delete] update error:', upErr)
    return NextResponse.json(
      { error: 'No pudimos eliminar tu cuenta. Probá de nuevo en un momento.' },
      { status: 500 },
    )
  }

  // signOut server-side: revoca la sesión actual + remueve cookies. Después
  // de esto, los próximos requests sin re-login fallan en 401.
  await supabase.auth.signOut()

  return NextResponse.json({
    ok: true,
    deleted_at: new Date().toISOString(),
    purge_after_days: 30,
    message: 'Tu cuenta fue marcada para eliminación. Tenés 30 días para recuperarla iniciando sesión.',
  })
}
