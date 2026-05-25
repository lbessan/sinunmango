import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'

// ─── /api/invitations/[token] ─────────────────────────────────────────────
//
// GET: pre-check antes de aceptar. Devuelve info pública de la invitación
//   (nombre de la cuenta, email del owner, role, estado) para que el invitee
//   pueda decidir si la acepta. No requiere auth — el token ES el secret.
//   Si está expirada/revocada/ya aceptada, devuelve el estado para que
//   la página muestre el mensaje apropiado.
//
// POST: el invitee acepta. Requiere auth. Setea invitee_user_id + accepted_at.
//   Usamos admin client para que la RLS no nos bloquee (el invitee no figura
//   como dueño del share — la primera vez no tiene acceso vía RLS).

// ── GET: preview de la invitación ──────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Validación liviana del token: 32 chars hex.
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: 'Invitación inválida' }, { status: 400 })
  }

  // Usamos admin client porque el user que está mirando esta página
  // probablemente NO sea el invitee todavía (puede que ni esté logueado).
  // El token mismo es la autorización.
  const { data: share } = await adminClient
    .from('account_shares')
    .select(`
      id,
      cuenta_id,
      owner_user_id,
      invitee_user_id,
      role,
      invited_at,
      expires_at,
      accepted_at,
      revoked_at,
      cuentas:cuenta_id(nombre_cuenta, tipo_cuenta)
    `)
    .eq('invite_token', token)
    .maybeSingle()

  if (!share) {
    return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
  }

  // Email del owner para mostrar "X te invitó a colaborar"
  let ownerEmail: string | null = null
  try {
    const { data: { user: ownerUser } } = await adminClient.auth.admin.getUserById(share.owner_user_id)
    ownerEmail = ownerUser?.email ?? null
  } catch {
    // ignorar — caso raro
  }

  // Estado derivado
  const now = new Date()
  const status: 'pending' | 'active' | 'expired' | 'revoked'
    = share.revoked_at  ? 'revoked'
    : share.accepted_at ? 'active'
    : new Date(share.expires_at) < now ? 'expired'
    : 'pending'

  return NextResponse.json({
    status,
    cuenta_nombre: (share.cuentas as { nombre_cuenta?: string } | null)?.nombre_cuenta ?? null,
    cuenta_tipo:   (share.cuentas as { tipo_cuenta?:   string } | null)?.tipo_cuenta   ?? null,
    role:          share.role,
    owner_email:   ownerEmail,
    expires_at:    share.expires_at,
    accepted_at:   share.accepted_at,
    // No exponemos invitee_user_id ni owner_user_id ni el share ID — solo
    // el mínimo necesario para que la página renderee.
  })
}

// ── POST: aceptar invitación ───────────────────────────────────────────────
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

  // Lookup vía admin client (igual que en GET).
  const { data: share } = await adminClient
    .from('account_shares')
    .select('id, owner_user_id, invitee_user_id, accepted_at, revoked_at, expires_at, cuenta_id')
    .eq('invite_token', token)
    .maybeSingle()

  if (!share) {
    return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
  }

  // No podés aceptar tu propia invitación (el CHECK constraint en DB
  // también lo bloquea, pero damos un error claro).
  if (share.owner_user_id === user.id) {
    return NextResponse.json(
      { error: 'No podés aceptar una invitación a tu propia cuenta.' },
      { status: 400 },
    )
  }

  if (share.revoked_at) {
    return NextResponse.json({ error: 'Esta invitación fue revocada.' }, { status: 410 })
  }

  if (new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Esta invitación expiró.' }, { status: 410 })
  }

  // Si ya está aceptada por otro user, devolvemos error. Si está aceptada
  // por el MISMO user, devolvemos ok (idempotente).
  if (share.accepted_at) {
    if (share.invitee_user_id === user.id) {
      return NextResponse.json({
        ok: true, already_accepted: true, cuenta_id: share.cuenta_id,
      })
    }
    return NextResponse.json(
      { error: 'Esta invitación ya fue aceptada por otro usuario.' },
      { status: 409 },
    )
  }

  // Verificar que no haya otro share activo para esta misma cuenta + user
  // (el unique index lo bloquea, pero damos error claro).
  const { data: existing } = await adminClient
    .from('account_shares')
    .select('id')
    .eq('cuenta_id', share.cuenta_id)
    .eq('invitee_user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle()

  if (existing && existing.id !== share.id) {
    return NextResponse.json(
      { error: 'Ya tenés acceso a esta cuenta por otra invitación.' },
      { status: 409 },
    )
  }

  // Aceptar: setear invitee_user_id + accepted_at.
  const { error: updErr } = await adminClient
    .from('account_shares')
    .update({
      invitee_user_id: user.id,
      accepted_at:     new Date().toISOString(),
    })
    .eq('id', share.id)

  if (updErr) {
    console.error('[invitations/accept] update error:', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, cuenta_id: share.cuenta_id })
}
