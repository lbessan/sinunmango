import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AcceptInvitationClient } from './client'
import { adminClient } from '@/lib/supabase/admin'
import { getAuthedClient } from '@/lib/supabase/server'

// ─── /invite/[token] (V2) ───────────────────────────────────────────────────
//
// Acepta invitaciones al workspace. Para V2, el invitee se une al workspace
// del owner y ve los recursos compartidos via share_resources.

export const metadata = {
  title: 'Invitación a workspace compartido — sinunmango',
}

type ShareRow = {
  id:              string
  owner_user_id:   string
  invitee_user_id: string | null
  role:            'viewer' | 'editor'
  expires_at:      string
  accepted_at:     string | null
  revoked_at:      string | null
  share_resources: Array<{ resource_type: string }> | null
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return <InvalidInvitation reason="format" />
  }

  const { data: share } = await adminClient
    .from('shares')
    .select(`
      id, owner_user_id, invitee_user_id, role,
      expires_at, accepted_at, revoked_at,
      share_resources(resource_type)
    `)
    .eq('invite_token', token)
    .maybeSingle<ShareRow>()

  if (!share) return <InvalidInvitation reason="not_found" />
  if (share.revoked_at) return <InvalidInvitation reason="revoked" />
  if (new Date(share.expires_at) < new Date() && !share.accepted_at) {
    return <InvalidInvitation reason="expired" />
  }

  // Owner email
  let ownerEmail = 'el dueño del workspace'
  try {
    const { data: { user: ownerUser } } = await adminClient.auth.admin.getUserById(share.owner_user_id)
    if (ownerUser?.email) ownerEmail = ownerUser.email
  } catch {
    // ignorar
  }

  // Counts de recursos
  const rs = share.share_resources ?? []
  const counts = {
    cuentas:      rs.filter(r => r.resource_type === 'cuenta').length,
    gastos_fijos: rs.filter(r => r.resource_type === 'gasto_fijo').length,
    inversiones:  rs.filter(r => r.resource_type === 'inversion').length,
  }

  const { user } = await getAuthedClient()

  if (!user) {
    return (
      <Wrapper>
        <Title>Invitación a workspace</Title>
        <p className="text-slate-600 leading-relaxed mb-6">
          <strong>{ownerEmail}</strong> te invitó a {share.role === 'editor' ? 'colaborar en' : 'ver'}{' '}
          su workspace de sinunmango.
        </p>
        <p className="text-slate-500 text-sm mb-6">
          Iniciá sesión o creá una cuenta para aceptar la invitación.
        </p>
        <Link href={`/login?next=/invite/${token}`}
              className="block w-full text-center px-5 py-3 rounded-xl text-white font-semibold"
              style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
          Iniciar sesión para aceptar
        </Link>
      </Wrapper>
    )
  }

  if (share.owner_user_id === user.id) {
    return (
      <Wrapper>
        <Title>Esta es tu propia invitación</Title>
        <p className="text-slate-600 leading-relaxed mb-6">
          Compartiste tu workspace con alguien más. Mandales este link para que lo acepten.
        </p>
        <Link href="/dashboard"
              className="block w-full text-center px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">
          Volver al dashboard
        </Link>
      </Wrapper>
    )
  }

  if (share.accepted_at && share.invitee_user_id && share.invitee_user_id !== user.id) {
    return <InvalidInvitation reason="taken" />
  }

  if (share.accepted_at && share.invitee_user_id === user.id) {
    redirect('/dashboard')
  }

  return (
    <Wrapper>
      <AcceptInvitationClient
        token={token}
        ownerEmail={ownerEmail}
        role={share.role}
        counts={counts}
      />
    </Wrapper>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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
  return <h1 className="text-2xl font-bold text-slate-900 mb-3">{children}</h1>
}

function InvalidInvitation({ reason }: {
  reason: 'format' | 'not_found' | 'expired' | 'revoked' | 'taken'
}) {
  const messages: Record<typeof reason, { title: string; body: string }> = {
    format:    { title: 'Link inválido', body: 'Este link no tiene el formato esperado. Pedile al dueño que te regenere uno.' },
    not_found: { title: 'Invitación no encontrada', body: 'Posiblemente fue revocada o expiró.' },
    expired:   { title: 'Invitación expirada', body: 'Las invitaciones duran 7 días. Pedí una nueva.' },
    revoked:   { title: 'Invitación revocada', body: 'El dueño canceló esta invitación.' },
    taken:     { title: 'Ya aceptada', body: 'Otra persona ya aceptó esta invitación.' },
  }
  const { title, body } = messages[reason]

  return (
    <Wrapper>
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <Title>{title}</Title>
      <p className="text-slate-600 leading-relaxed mb-6">{body}</p>
      <Link href="/dashboard"
            className="block w-full text-center px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">
        Ir al dashboard
      </Link>
    </Wrapper>
  )
}
