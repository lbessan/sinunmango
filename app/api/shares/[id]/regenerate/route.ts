import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── POST /api/shares/[id]/regenerate ────────────────────────────────────────
//
// Genera un nuevo invite_token + extiende expires_at +7 días para un share
// existente. Sirve cuando el link original expiró (7 días sin aceptar) o
// se compartió mal y el owner quiere uno fresco para reenviar.
//
// Reglas:
//   - Solo el owner del share puede regenerar.
//   - Solo shares que NO fueron aceptados todavía (sino el invitee ya está
//     dentro y el token no se usa más).
//   - Solo shares NO revocados.
//   - El token nuevo no afecta los recursos compartidos ni el role.

function newToken(): string {
  return randomBytes(16).toString('hex')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  // Validar ownership + estado del share
  const { data: share } = await supabase
    .from('shares')
    .select('id, accepted_at, revoked_at')
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!share) {
    return NextResponse.json({ error: 'Share no encontrado' }, { status: 404 })
  }
  if (share.revoked_at) {
    return NextResponse.json({ error: 'No podés regenerar un share revocado' }, { status: 400 })
  }
  if (share.accepted_at) {
    return NextResponse.json({ error: 'Este share ya fue aceptado — el link no se usa más' }, { status: 400 })
  }

  const invite_token = newToken()
  // +7 días desde ahora
  const expires_at   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('shares')
    .update({ invite_token, expires_at })
    .eq('id', id)
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('[shares/regenerate] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
    ?? 'https://app.sinunmango.com.ar'

  return NextResponse.json({
    ok:           true,
    invite_token,
    invite_url:   `${baseUrl}/invite/${invite_token}`,
    expires_at,
  })
}
