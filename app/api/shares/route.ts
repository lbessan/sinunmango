import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'
import { getUserPlan } from '@/lib/subscription'
import { validateEnum, validateId, type Validated } from '@/lib/validators'

// ─── /api/shares (V2) ────────────────────────────────────────────────────────
//
// V2 cambia el paradigma: un share es una invitación al WORKSPACE del owner,
// con una lista granular de qué recursos del workspace ve el invitee.
//
// POST: owner crea share + invite_token + resources[].
//   Body: {
//     role: 'viewer' | 'editor',
//     resources: {
//       cuentas:      string[]   // IDs de cuentas (incluye tarjetas)
//       gastos_fijos: string[]
//       inversiones:  string[]
//     }
//   }
//   Pro gate: solo Pro puede compartir.
//
// GET: listar shares outgoing (creados por mí, como owner). Devuelve
//   resources por share + status derivado.

const ROLES = ['viewer', 'editor'] as const
const RESOURCE_TYPES = ['cuenta', 'gasto_fijo', 'inversion'] as const

type ShareBody = {
  role:      typeof ROLES[number]
  resources: {
    cuentas:      string[]
    gastos_fijos: string[]
    inversiones:  string[]
  }
}

function validateBody(raw: unknown): Validated<ShareBody> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const role = validateEnum(b.role, ROLES, 'role')
  if (!role.ok) return role

  const res = b.resources
  if (typeof res !== 'object' || res === null) {
    return { ok: false, error: 'resources es requerido' }
  }
  const r = res as Record<string, unknown>

  function validateList(v: unknown, field: string): Validated<string[]> {
    if (!Array.isArray(v)) return { ok: false, error: `${field} debe ser array` }
    const out: string[] = []
    for (let i = 0; i < v.length; i++) {
      const id = validateId(v[i], `${field}[${i}]`)
      if (!id.ok) return id
      out.push(id.data)
    }
    return { ok: true, data: out }
  }

  const cuentas      = validateList(r.cuentas       ?? [], 'cuentas')
  if (!cuentas.ok) return cuentas
  const gastosFijos  = validateList(r.gastos_fijos  ?? [], 'gastos_fijos')
  if (!gastosFijos.ok) return gastosFijos
  const inversiones  = validateList(r.inversiones   ?? [], 'inversiones')
  if (!inversiones.ok) return inversiones

  // Al menos UN recurso requerido — share vacío no tiene sentido.
  if (cuentas.data.length === 0 && gastosFijos.data.length === 0 && inversiones.data.length === 0) {
    return { ok: false, error: 'Hay que elegir al menos un recurso para compartir' }
  }

  return {
    ok: true,
    data: {
      role: role.data,
      resources: {
        cuentas:      cuentas.data,
        gastos_fijos: gastosFijos.data,
        inversiones:  inversiones.data,
      },
    },
  }
}

function generateInviteToken(): string {
  return randomBytes(16).toString('hex')
}

// ── POST: crear share ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Pro gate
  const plan = await getUserPlan(supabase)
  if (!plan.has_pro_access) {
    return NextResponse.json(
      { error: 'requires_pro', message: 'Compartir workspace es una feature Pro.' },
      { status: 403 },
    )
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateBody(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Validar que TODOS los recursos pertenezcan al user (RLS lo chequearía,
  // pero damos error claro si alguno no es del owner).
  if (v.data.resources.cuentas.length > 0) {
    const { data: cuentasCheck } = await supabase
      .from('cuentas').select('id').in('id', v.data.resources.cuentas).eq('user_id', user.id)
    if ((cuentasCheck?.length ?? 0) !== v.data.resources.cuentas.length) {
      return NextResponse.json({ error: 'Alguna cuenta no es tuya o no existe' }, { status: 400 })
    }
  }
  if (v.data.resources.gastos_fijos.length > 0) {
    const { data: gfCheck } = await supabase
      .from('gastos_fijos').select('id').in('id', v.data.resources.gastos_fijos).eq('user_id', user.id)
    if ((gfCheck?.length ?? 0) !== v.data.resources.gastos_fijos.length) {
      return NextResponse.json({ error: 'Algún gasto fijo no es tuyo o no existe' }, { status: 400 })
    }
  }
  if (v.data.resources.inversiones.length > 0) {
    const { data: invCheck } = await supabase
      .from('inversiones').select('id').in('id', v.data.resources.inversiones).eq('user_id', user.id)
    if ((invCheck?.length ?? 0) !== v.data.resources.inversiones.length) {
      return NextResponse.json({ error: 'Alguna inversión no es tuya o no existe' }, { status: 400 })
    }
  }

  // Crear share
  const inviteToken = generateInviteToken()
  const { data: created, error: insErr } = await supabase
    .from('shares')
    .insert({
      owner_user_id: user.id,
      invite_token:  inviteToken,
      role:          v.data.role,
    })
    .select('id, invite_token, role, invited_at, expires_at')
    .single()

  if (insErr || !created) {
    console.error('[shares/create] insert error:', insErr)
    return NextResponse.json({ error: insErr?.message ?? 'No se pudo crear el share' }, { status: 500 })
  }

  // Insertar share_resources
  const resourceRows: Array<{ share_id: string; resource_type: string; resource_id: string }> = []
  for (const id of v.data.resources.cuentas)      resourceRows.push({ share_id: created.id, resource_type: 'cuenta',     resource_id: id })
  for (const id of v.data.resources.gastos_fijos) resourceRows.push({ share_id: created.id, resource_type: 'gasto_fijo', resource_id: id })
  for (const id of v.data.resources.inversiones)  resourceRows.push({ share_id: created.id, resource_type: 'inversion',  resource_id: id })

  if (resourceRows.length > 0) {
    const { error: rsErr } = await supabase
      .from('share_resources').insert(resourceRows)
    if (rsErr) {
      // Si el insert de resources falla, hard-revertimos el share creado.
      await supabase.from('shares').delete().eq('id', created.id)
      console.error('[shares/create] resources insert error:', rsErr)
      return NextResponse.json({ error: rsErr.message }, { status: 500 })
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
    ?? 'https://app.sinunmango.com.ar'

  return NextResponse.json({
    ok:           true,
    id:           created.id,
    invite_token: created.invite_token,
    invite_url:   `${baseUrl}/invite/${created.invite_token}`,
    role:         created.role,
    expires_at:   created.expires_at,
    resources:    v.data.resources,
  })
}

// ── GET: listar shares outgoing ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: shares, error } = await supabase
    .from('shares')
    .select(`
      id,
      invitee_user_id,
      invite_token,
      role,
      invited_at,
      expires_at,
      accepted_at,
      revoked_at,
      share_resources(resource_type, resource_id)
    `)
    .eq('owner_user_id', user.id)
    .order('invited_at', { ascending: false })

  if (error) {
    console.error('[shares/list] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Emails de invitees aceptados
  const inviteeIds = (shares ?? [])
    .map(s => s.invitee_user_id).filter((id): id is string => !!id)
  const emailsByUserId: Record<string, string> = {}
  for (const id of Array.from(new Set(inviteeIds))) {
    try {
      const { data: { user: u } } = await adminClient.auth.admin.getUserById(id)
      if (u?.email) emailsByUserId[id] = u.email
    } catch {
      // ignorar
    }
  }

  return NextResponse.json({
    shares: (shares ?? []).map(s => {
      type SR = { resource_type: string; resource_id: string }
      const rs = (s.share_resources as unknown as SR[] | null) ?? []
      return {
        id:           s.id,
        invite_token: s.invite_token,
        role:         s.role,
        invited_at:   s.invited_at,
        expires_at:   s.expires_at,
        accepted_at:  s.accepted_at,
        revoked_at:   s.revoked_at,
        invitee_email: s.invitee_user_id ? emailsByUserId[s.invitee_user_id] ?? null : null,
        resources: {
          cuentas:      rs.filter(r => r.resource_type === 'cuenta').map(r => r.resource_id),
          gastos_fijos: rs.filter(r => r.resource_type === 'gasto_fijo').map(r => r.resource_id),
          inversiones:  rs.filter(r => r.resource_type === 'inversion').map(r => r.resource_id),
        },
        status: s.revoked_at  ? 'revoked'
              : s.accepted_at ? 'active'
              : new Date(s.expires_at) < new Date() ? 'expired'
              : 'pending',
      }
    }),
  })
}
