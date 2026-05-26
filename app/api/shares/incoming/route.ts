import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'

// ─── GET /api/shares/incoming ───────────────────────────────────────────────
//
// Lista los shares INCOMING (donde soy invitee + ya acepté).
// Devuelve el owner_email para mostrar "Lucho te invitó al workspace".

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: shares, error } = await supabase
    .from('shares')
    .select(`
      id,
      owner_user_id,
      role,
      accepted_at,
      share_resources(resource_type, resource_id)
    `)
    .eq('invitee_user_id', user.id)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .order('accepted_at', { ascending: false })

  if (error) {
    console.error('[shares/incoming] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Owner emails para "compartido por X" — paralelizado.
  const ownerIds = Array.from(new Set((shares ?? []).map(s => s.owner_user_id)))
  const emailsByOwnerId: Record<string, string> = {}
  const lookups = await Promise.allSettled(
    ownerIds.map(id => adminClient.auth.admin.getUserById(id).then(r => ({ id, email: r.data.user?.email })))
  )
  for (const l of lookups) {
    if (l.status === 'fulfilled' && l.value.email) {
      emailsByOwnerId[l.value.id] = l.value.email
    }
  }

  return NextResponse.json({
    shares: (shares ?? []).map(s => {
      type SR = { resource_type: string; resource_id: string }
      const rs = (s.share_resources as unknown as SR[] | null) ?? []
      return {
        id:           s.id,
        owner_user_id: s.owner_user_id,
        owner_email:  emailsByOwnerId[s.owner_user_id] ?? null,
        role:         s.role,
        accepted_at:  s.accepted_at,
        resources: {
          cuentas:      rs.filter(r => r.resource_type === 'cuenta').map(r => r.resource_id),
          gastos_fijos: rs.filter(r => r.resource_type === 'gasto_fijo').map(r => r.resource_id),
          inversiones:  rs.filter(r => r.resource_type === 'inversion').map(r => r.resource_id),
        },
      }
    }),
  })
}
