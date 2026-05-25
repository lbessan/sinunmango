import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'

// ─── GET /api/account-shares/incoming ───────────────────────────────────────
//
// Lista las cuentas compartidas CONMIGO (donde soy invitee y ya acepté).
//
// Para mostrar en /configuracion → "Cuentas compartidas conmigo": qué cuentas
// veo gracias a un share, quién las comparte, en qué rol estoy.

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // RLS de account_shares ya filtra: solo veo shares donde soy invitee Y
  // están aceptados. Pero le agregamos el filtro explícito por defensa.
  const { data: shares, error } = await supabase
    .from('account_shares')
    .select(`
      id,
      cuenta_id,
      owner_user_id,
      role,
      accepted_at,
      cuentas:cuenta_id(nombre_cuenta, tipo_cuenta, moneda)
    `)
    .eq('invitee_user_id', user.id)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .order('accepted_at', { ascending: false })

  if (error) {
    console.error('[account-shares/incoming] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer con email del owner para mostrar "compartido por X".
  const ownerIds = Array.from(new Set((shares ?? []).map(s => s.owner_user_id)))
  const emailsByUserId: Record<string, string> = {}
  for (const id of ownerIds) {
    try {
      const { data: { user: u } } = await adminClient.auth.admin.getUserById(id)
      if (u?.email) emailsByUserId[id] = u.email
    } catch {
      // ignorar — si el owner se eliminó, no debería pasar (RLS cascade)
    }
  }

  return NextResponse.json({
    shares: (shares ?? []).map(s => ({
      id:            s.id,
      cuenta_id:     s.cuenta_id,
      cuenta_nombre: (s.cuentas as { nombre_cuenta?: string } | null)?.nombre_cuenta ?? null,
      cuenta_tipo:   (s.cuentas as { tipo_cuenta?:   string } | null)?.tipo_cuenta   ?? null,
      cuenta_moneda: (s.cuentas as { moneda?: string }       | null)?.moneda         ?? null,
      role:          s.role,
      owner_email:   emailsByUserId[s.owner_user_id] ?? null,
      accepted_at:   s.accepted_at,
    })),
  })
}
