import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── DELETE /api/account-shares/[id] ─────────────────────────────────────────
//
// El owner revoca un share. No lo borramos físicamente (set revoked_at) para
// auditoría y para poder mostrar "compartías con X, lo revocaste el día Y".
//
// Idempotente: revocar uno ya revocado devuelve 200 sin cambios.
//
// El invitee inmediatamente pierde acceso a la cuenta y sus movimientos
// (las RLS de cuentas/movimientos filtran por revoked_at IS NULL).

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  // RLS valida que el user sea owner del share. Si no lo es, el UPDATE no
  // afecta filas y devolvemos 404.
  const { data: updated, error } = await supabase
    .from('account_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_user_id', user.id)  // defensa explícita además de RLS
    .select('id, revoked_at')

  if (error) {
    console.error('[account-shares/delete] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Share no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, revoked_at: updated[0].revoked_at })
}
