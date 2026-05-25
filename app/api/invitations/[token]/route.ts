import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'

// ─── /api/invitations/[token] (V2) ───────────────────────────────────────────
//
// GET: preview público de la invitación. Devuelve info del workspace
//   (owner_email + resources count + role + status). No requiere auth.
//
// POST: invitee acepta. Requiere auth. Setea invitee_user_id + accepted_at.
//   Usa admin client (la RLS bloquearía al invitee pre-accept).

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: 'Invitación inválida' }, { status: 400 })
  }

  const { data: share } = await adminClient
    .from('shares')
    .select(`
      id, owner_user_id, invitee_user_id, role,
      invited_at, expires_at, accepted_at, revoked_at,
      share_resources(resource_type)
    `)
    .eq('invite_token', token)
    .maybeSingle()

  if (!share) {
    return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
  }

  // Owner email
  let ownerEmail: string | null = null
  try {
    const { data: { user: u } } = await adminClient.auth.admin.getUserById(share.owner_user_id)
    ownerEmail = u?.email ?? null
  } catch {
    // ignorar
  }

  type SR = { resource_type: string }
  const rs = (share.share_resources as unknown as SR[] | null) ?? []
  const counts = {
    cuentas:      rs.filter(r => r.resource_type === 'cuenta').length,
    gastos_fijos: rs.filter(r => r.resource_type === 'gasto_fijo').length,
    inversiones:  rs.filter(r => r.resource_type === 'inversion').length,
  }

  const status: 'pending' | 'active' | 'expired' | 'revoked'
    = share.revoked_at  ? 'revoked'
    : share.accepted_at ? 'active'
    : new Date(share.expires_at) < new Date() ? 'expired'
    : 'pending'

  return NextResponse.json({
    status,
    role:        share.role,
    owner_email: ownerEmail,
    expires_at:  share.expires_at,
    counts,  // cuántos recursos hay en cada categoría
  })
}

// ── POST: aceptar ──────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: 'Invitación inválida' }, { status: 400 })
  }

  const { data: share } = await adminClient
    .from('shares')
    .select('id, owner_user_id, invitee_user_id, accepted_at, revoked_at, expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!share) {
    return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
  }
  if (share.owner_user_id === user.id) {
    return NextResponse.json({ error: 'No podés aceptar una invitación a tu propio workspace.' }, { status: 400 })
  }
  if (share.revoked_at) {
    return NextResponse.json({ error: 'Esta invitación fue revocada.' }, { status: 410 })
  }
  if (new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Esta invitación expiró.' }, { status: 410 })
  }

  // Si ya está aceptada por OTRO user → 409. Si por mí → idempotente.
  if (share.accepted_at) {
    if (share.invitee_user_id === user.id) {
      return NextResponse.json({ ok: true, already_accepted: true, owner_user_id: share.owner_user_id })
    }
    return NextResponse.json({ error: 'Esta invitación ya fue aceptada por otro usuario.' }, { status: 409 })
  }

  // Si ya tengo otro share activo con el mismo owner → 409 (el unique
  // index lo bloquea, pero damos error claro).
  const { data: existing } = await adminClient
    .from('shares')
    .select('id')
    .eq('owner_user_id', share.owner_user_id)
    .eq('invitee_user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle()

  if (existing && existing.id !== share.id) {
    return NextResponse.json(
      { error: 'Ya tenés acceso al workspace de este usuario por otra invitación.' },
      { status: 409 },
    )
  }

  const { error: updErr } = await adminClient
    .from('shares')
    .update({ invitee_user_id: user.id, accepted_at: new Date().toISOString() })
    .eq('id', share.id)

  if (updErr) {
    console.error('[invitations/accept] update error:', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, owner_user_id: share.owner_user_id })
}
