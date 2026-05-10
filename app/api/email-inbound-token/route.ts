import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'

// ─── Token generation ─────────────────────────────────────────────────────────

function randomSuffix(n = 4): string {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Genera un token legible basado en el email del usuario.
 * Si hay colisión con otro user, agrega un sufijo random.
 *
 * IMPORTANTE: la verificación de unicidad necesita leer tokens de OTROS users,
 * cosa que RLS no permite con el cliente del user. Por eso usamos adminClient
 * solo para esta query puntual (read-only, sobre una sola columna).
 */
async function generateTokenForUser(email: string): Promise<string> {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')   // quita puntos, +, guiones
    .slice(0, 24)

  const candidate = base || randomSuffix(8)

  const { data: existing } = await adminClient
    .from('user_preferences')
    .select('user_id')
    .eq('email_inbound_token', candidate)
    .maybeSingle()

  if (!existing) return candidate

  // Colisión: agregar sufijo corto
  return `${candidate.slice(0, 18)}-${randomSuffix(2)}`
}

// ─── GET /api/email-inbound-token ─────────────────────────────────────────────
// Returns existing token (or creates one if none exists yet)
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_preferences')
    .select('email_inbound_token, gmail_verification_code')
    .eq('user_id', user.id)
    .maybeSingle()

  if (data?.email_inbound_token) {
    return NextResponse.json({
      token:                   data.email_inbound_token,
      gmail_verification_code: data.gmail_verification_code ?? null,
    })
  }

  // First time: generate and persist token based on email
  const token = await generateTokenForUser(user.email ?? '')
  await supabase
    .from('user_preferences')
    .upsert(
      { user_id: user.id, email_inbound_token: token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  return NextResponse.json({ token, gmail_verification_code: null })
}

// ─── POST /api/email-inbound-token ────────────────────────────────────────────
// Regenerates the token (invalidates the previous one)
export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await generateTokenForUser(user.email ?? '')
  await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id:                 user.id,
        email_inbound_token:     token,
        gmail_verification_code: null,    // reset any pending code
        updated_at:              new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  return NextResponse.json({ token })
}

// ─── PATCH /api/email-inbound-token ───────────────────────────────────────────
// Marca el reenvío de Gmail como confirmado manualmente por el usuario
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('user_preferences')
    .upsert(
      { user_id: user.id, gmail_verification_code: 'VERIFIED', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  return NextResponse.json({ ok: true })
}
