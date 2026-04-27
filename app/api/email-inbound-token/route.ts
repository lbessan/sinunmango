import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// ─── Token generation ─────────────────────────────────────────────────────────
function generateToken(): string {
  // 12 random bytes → 24 hex chars; URL-safe, enough entropy
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── GET /api/email-inbound-token ─────────────────────────────────────────────
// Returns existing token (or creates one if none exists yet)
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await adminClient
    .from('user_preferences')
    .select('email_inbound_token, gmail_verification_code')
    .eq('user_id', user.id)
    .maybeSingle()

  if (data?.email_inbound_token) {
    return NextResponse.json({
      token:                 data.email_inbound_token,
      gmail_verification_code: data.gmail_verification_code ?? null,
    })
  }

  // First time: generate and persist token
  const token = generateToken()
  await adminClient
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
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = generateToken()
  await adminClient
    .from('user_preferences')
    .upsert(
      {
        user_id:               user.id,
        email_inbound_token:   token,
        gmail_verification_code: null,    // reset any pending code
        updated_at:            new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  return NextResponse.json({ token })
}
