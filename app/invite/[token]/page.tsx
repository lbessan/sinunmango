import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AcceptInvitationClient } from './client'
import { adminClient } from '@/lib/supabase/admin'
import { getAuthedClient } from '@/lib/supabase/server'

// ─── /invite/[token] — página pública para aceptar invitación ───────────────
//
// Flow:
//   1. Server-side: lookup del share por token (sin auth).
//   2. Si el token es inválido / no existe / expirado / revocado, mostramos
//      mensaje informativo sin botón.
//   3. Si está activa y el user NO está autenticado, mostramos "Iniciá sesión
//      para aceptar" con link a /login?next=/invite/[token]. Una vez logueado,
//      Supabase Auth lo redirige acá y el componente client maneja el accept.
//   4. Si está activa y el user está autenticado, mostramos "Querés unirte a
//      la cuenta X de Y?" con botón Aceptar.
//   5. Si el user es el owner, mostramos "Esta es tu propia invitación".
//
// El token se valida en server. El POST de accept va por el endpoint
// /api/invitations/[token] con la sesión del user.

export const metadata = {
  title: 'Invitación a cuenta compartida — sinunmango',
}

type Share = {
  id:              string
  cuenta_id:       string
  owner_user_id:   string
  invitee_user_id: string | null
  role:            'viewer' | 'editor'
  expires_at:      string
  accepted_at:     string | null
  revoked_at:      string | null
  cuentas:         { nombre_cuenta: string; tipo_cuenta: string } | null
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Validación liviana del formato (32 hex)
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return <InvalidInvitation reason="format" />
  }

  // Lookup del share (admin client — no requiere auth porque el token es
  // el bearer de la invitación).
  const { data: share } = await adminClient
    .from('account_shares')
    .select(`
      id, cuenta_id, owner_user_id, invitee_user_id, role,
      expires_at, accepted_at, revoked_at,
      cuentas:cuenta_id(nombre_cuenta, tipo_cuenta)
    `)
    .eq('invite_token', token)
    .maybeSingle<Share>()

  if (!share) {
    return <InvalidInvitation reason="not_found" />
  }

  if (share.revoked_at) {
    return <InvalidInvitation reason="revoked" />
  }
  if (new Date(share.expires_at) < new Date() && !share.accepted_at) {
    return <InvalidInvitation reason="expired" />
  }

  // Email del owner (para mostrar quién invita)
  let ownerEmail = 'el dueño de la cuenta'
  try {
    const { data: { user: ownerUser } } = await adminClient.auth.admin.getUserById(share.owner_user_id)
    if (ownerUser?.email) ownerEmail = ownerUser.email
  } catch {
    // ignorar — usamos el fallback
  }

  // Chequeo de auth: si no está logueado, mostramos prompt.
  const { user } = await getAuthedClient()

  if (!user) {
    return (
      <Wrapper>
        <Title>Invitación pendiente</Title>
        <p className="text-slate-600 leading-relaxed mb-6">
          <strong>{ownerEmail}</strong> te invitó a {share.role === 'editor' ? 'colaborar en' : 'ver'}{' '}
          la cuenta <strong>{share.cuentas?.nombre_cuenta ?? '(sin nombre)'}</strong> en sinunmango.
        </p>
        <p className="text-slate-500 text-sm mb-6">
          Iniciá sesión o creá una cuenta para aceptar la invitación.
        </p>
        <Link
          href={`/login?next=/invite/${token}`}
          className="block w-full text-center px-5 py-3 rounded-xl text-white font-semibold transition-all hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}
        >
          Iniciar sesión para aceptar
        </Link>
      </Wrapper>
    )
  }

  // Si el user es el dueño, no puede aceptar su propia invitación
  if (share.owner_user_id === user.id) {
    return (
      <Wrapper>
        <Title>Esta es tu propia invitación</Title>
        <p className="text-slate-600 leading-relaxed mb-6">
          Compartiste la cuenta <strong>{share.cuentas?.nombre_cuenta}</strong> con alguien más.
          Mandales este link para que la acepten.
        </p>
        <Link
          href={`/cuentas/${share.cuenta_id}`}
          className="block w-full text-center px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
        >
          Ver la cuenta
        </Link>
      </Wrapper>
    )
  }

  // ¿Ya fue aceptada por OTRO user?
  if (share.accepted_at && share.invitee_user_id && share.invitee_user_id !== user.id) {
    return <InvalidInvitation reason="taken" />
  }

  // ¿Ya la aceptamos NOSOTROS antes? Idempotente: redirigimos a la cuenta.
  if (share.accepted_at && share.invitee_user_id === user.id) {
    redirect(`/cuentas/${share.cuenta_id}`)
  }

  // Estado normal: invitación pending para este user → mostramos accept.
  return (
    <Wrapper>
      <AcceptInvitationClient
        token={token}
        ownerEmail={ownerEmail}
        cuentaNombre={share.cuentas?.nombre_cuenta ?? '(sin nombre)'}
        cuentaTipo={share.cuentas?.tipo_cuenta ?? null}
        role={share.role}
      />
    </Wrapper>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f1f5f9' }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        {children}
      </div>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-bold text-slate-900 mb-3">{children}</h1>
  )
}

function InvalidInvitation({
  reason,
}: {
  reason: 'format' | 'not_found' | 'expired' | 'revoked' | 'taken'
}) {
  const messages: Record<typeof reason, { title: string; body: string }> = {
    format: {
      title: 'Link inválido',
      body:  'Este link de invitación no tiene el formato esperado. Pedile al dueño de la cuenta que te regenere uno.',
    },
    not_found: {
      title: 'Invitación no encontrada',
      body:  'Este link no corresponde a ninguna invitación activa. Posiblemente fue revocada o expiró.',
    },
    expired: {
      title: 'Invitación expirada',
      body:  'Esta invitación venció (las invitaciones duran 7 días). Pedile al dueño de la cuenta que te genere una nueva.',
    },
    revoked: {
      title: 'Invitación revocada',
      body:  'El dueño de la cuenta canceló esta invitación. Si necesitás acceso, pedile que te genere una nueva.',
    },
    taken: {
      title: 'Invitación ya aceptada',
      body:  'Esta invitación ya fue aceptada por otra persona. Si tenías que aceptar vos, pedile al dueño que te mande una nueva.',
    },
  }
  const { title, body } = messages[reason]

  return (
    <Wrapper>
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8"  x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <Title>{title}</Title>
      <p className="text-slate-600 leading-relaxed mb-6">{body}</p>
      <Link
        href="/dashboard"
        className="block w-full text-center px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
      >
        Ir al dashboard
      </Link>
    </Wrapper>
  )
}
