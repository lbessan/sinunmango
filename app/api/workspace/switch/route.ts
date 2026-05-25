import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'
import { setWorkspaceCookie, clearWorkspaceCookie } from '@/lib/workspace'
import { validateId, type Validated } from '@/lib/validators'

// ─── POST /api/workspace/switch ──────────────────────────────────────────────
//
// Setea la cookie current_workspace_id para cambiar el workspace activo.
//
// Body: { workspace_id: string }
//   - Si workspace_id === user.id → setea como own (clear cookie).
//   - Si workspace_id es otro user → valida que tenga share activo.
//   - Si no hay share válido → 403.

type Body = { workspace_id: string }

function validateBody(raw: unknown): Validated<Body> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  // workspace_id puede ser un UUID (auth.users.id es UUID) — no podemos usar
  // validateId() que limita a [a-zA-Z0-9_-]. Validamos formato UUID liviano.
  if (typeof b.workspace_id !== 'string') return { ok: false, error: 'workspace_id es requerido' }
  if (!/^[0-9a-f-]{36}$/i.test(b.workspace_id)) {
    return { ok: false, error: 'workspace_id formato inválido' }
  }
  return { ok: true, data: { workspace_id: b.workspace_id } }
}

export async function POST(req: NextRequest) {
  const { user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateBody(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Switch a own → clear cookie
  if (v.data.workspace_id === user.id) {
    await clearWorkspaceCookie()
    return NextResponse.json({ ok: true, workspace_id: user.id, isOwn: true })
  }

  // Switch a otro → validar share activo
  const { data: shares } = await adminClient
    .from('shares')
    .select('id')
    .eq('owner_user_id',  v.data.workspace_id)
    .eq('invitee_user_id', user.id)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .limit(1)

  if (!shares || shares.length === 0) {
    return NextResponse.json(
      { error: 'No tenés acceso a ese workspace.' },
      { status: 403 },
    )
  }

  await setWorkspaceCookie(v.data.workspace_id)
  return NextResponse.json({ ok: true, workspace_id: v.data.workspace_id, isOwn: false })
}
