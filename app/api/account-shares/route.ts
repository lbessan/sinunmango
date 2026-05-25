import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'
import { getUserPlan } from '@/lib/subscription'
import { validateId, validateEnum, type Validated } from '@/lib/validators'

// ─── /api/account-shares ─────────────────────────────────────────────────────
//
// POST: el owner crea un share + invite_token. Es la entrada del flow.
//   Body: { cuenta_id: string, role: 'viewer' | 'editor' }
//   Pro gate: solo users Pro pueden crear shares.
//
// GET: lista los shares creados por el owner autenticado (outgoing). Devuelve
//   también el nombre de la cuenta + info del invitee (si ya aceptó).
//
// El share por defecto expira a los 7 días si nadie lo acepta (default a
// nivel DB). El owner puede revocarlo en cualquier momento vía DELETE.

const ROLES = ['viewer', 'editor'] as const

type ShareBody = { cuenta_id: string; role: typeof ROLES[number] }

function validateBody(raw: unknown): Validated<ShareBody> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const cuenta = validateId(b.cuenta_id, 'cuenta_id')
  if (!cuenta.ok) return cuenta
  const role = validateEnum(b.role, ROLES, 'role')
  if (!role.ok) return role
  return { ok: true, data: { cuenta_id: cuenta.data, role: role.data } }
}

// Token de invitación: 32 chars hex (16 bytes) — ~3.4×10^38 combinaciones,
// imposible de adivinar por brute force razonable. Lo enviamos en la URL.
function generateInviteToken(): string {
  return randomBytes(16).toString('hex')
}

// ── POST: crear share ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Pro gate: solo Pro puede compartir cuentas (diferenciador del plan).
  const plan = await getUserPlan(supabase)
  if (!plan.has_pro_access) {
    return NextResponse.json(
      { error: 'requires_pro', message: 'Compartir cuentas es una feature Pro.' },
      { status: 403 },
    )
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateBody(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Verificar que la cuenta sea del owner (defensa: RLS también lo chequea
  // en el INSERT, pero damos un error claro si no es suya).
  const { data: cuenta, error: cuentaErr } = await supabase
    .from('cuentas')
    .select('id, user_id, nombre_cuenta')
    .eq('id', v.data.cuenta_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (cuentaErr || !cuenta) {
    return NextResponse.json({ error: 'Cuenta no encontrada o no es tuya.' }, { status: 404 })
  }

  // Crear el share. invite_token tiene UNIQUE constraint — en la
  // probabilísticamente-imposible colisión, devolvemos error y el cliente
  // reintenta.
  const inviteToken = generateInviteToken()

  const { data: created, error: insErr } = await supabase
    .from('account_shares')
    .insert({
      cuenta_id:     v.data.cuenta_id,
      owner_user_id: user.id,
      invite_token:  inviteToken,
      role:          v.data.role,
      // invited_at + expires_at + accepted_at + revoked_at usan defaults DB.
    })
    .select('id, invite_token, role, invited_at, expires_at')
    .single()

  if (insErr || !created) {
    console.error('[account-shares] insert error:', insErr)
    return NextResponse.json({ error: insErr?.message ?? 'No se pudo crear el share' }, { status: 500 })
  }

  // URL para que el owner copie + comparta con el invitee.
  // APP_URL en server-side; client-side derivamos de window.location en el modal.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
    ?? 'https://app.sinunmango.com.ar'

  return NextResponse.json({
    ok:           true,
    id:           created.id,
    invite_token: created.invite_token,
    invite_url:   `${baseUrl}/invite/${created.invite_token}`,
    role:         created.role,
    expires_at:   created.expires_at,
    cuenta:       { id: cuenta.id, nombre: cuenta.nombre_cuenta },
  })
}

// ── GET: listar shares outgoing (creados por el owner autenticado) ──────────
//
// Devolvemos también:
//   - nombre de la cuenta
//   - email del invitee (si ya aceptó) — para mostrar "Compartido con X"
//
// Ordenamos: más recientes primero. Por ahora no paginamos (los usuarios
// no van a tener cientos de shares).
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: shares, error } = await supabase
    .from('account_shares')
    .select(`
      id,
      cuenta_id,
      invitee_user_id,
      invite_token,
      role,
      invited_at,
      expires_at,
      accepted_at,
      revoked_at,
      cuentas:cuenta_id(nombre_cuenta, tipo_cuenta)
    `)
    .eq('owner_user_id', user.id)
    .order('invited_at', { ascending: false })

  if (error) {
    console.error('[account-shares] list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer con email del invitee. Lo hacemos vía admin client porque
  // auth.users no es accesible vía RLS desde el client del user.
  const inviteeIds = (shares ?? [])
    .map(s => s.invitee_user_id)
    .filter((id): id is string => !!id)

  let emailsByUserId: Record<string, string> = {}
  if (inviteeIds.length > 0) {
    // listUsers no acepta filtrar por IDs específicos en supabase-js v2,
    // así que iteramos. Para volúmenes esperados (un user tiene <10 shares)
    // esto es OK.
    for (const id of inviteeIds) {
      try {
        const { data: { user: u } } = await adminClient.auth.admin.getUserById(id)
        if (u?.email) emailsByUserId[id] = u.email
      } catch {
        // si falla, queda undefined — el cliente puede mostrar "Usuario eliminado"
      }
    }
  }

  return NextResponse.json({
    shares: (shares ?? []).map(s => ({
      id:              s.id,
      cuenta_id:       s.cuenta_id,
      cuenta_nombre:   (s.cuentas as { nombre_cuenta?: string } | null)?.nombre_cuenta ?? null,
      cuenta_tipo:     (s.cuentas as { tipo_cuenta?:   string } | null)?.tipo_cuenta   ?? null,
      invite_token:    s.invite_token,
      role:            s.role,
      invited_at:      s.invited_at,
      expires_at:      s.expires_at,
      accepted_at:     s.accepted_at,
      revoked_at:      s.revoked_at,
      invitee_email:   s.invitee_user_id ? emailsByUserId[s.invitee_user_id] ?? null : null,
      // Estado derivado para UI: pending | active | expired | revoked
      status: s.revoked_at  ? 'revoked'
             : s.accepted_at ? 'active'
             : new Date(s.expires_at) < new Date() ? 'expired'
             : 'pending',
    })),
  })
}
