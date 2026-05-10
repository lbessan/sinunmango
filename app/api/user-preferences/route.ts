import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── Types ────────────────────────────────────────────────────────────────────
export type UserPreferences = {
  alerta_vencimientos_activa: boolean
  alerta_vencimientos_dias:   number[]    // e.g. [0, 1, 3]
  alerta_resumen_semanal:     boolean
  alerta_resumen_mensual:     boolean
}

const DEFAULTS: UserPreferences = {
  alerta_vencimientos_activa: true,
  alerta_vencimientos_dias:   [0, 1, 3],
  alerta_resumen_semanal:     false,
  alerta_resumen_mensual:     false,
}

// ─── GET /api/user-preferences ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_preferences')
    .select('alerta_vencimientos_activa, alerta_vencimientos_dias, alerta_resumen_semanal, alerta_resumen_mensual')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return saved prefs or defaults if row doesn't exist yet
  return NextResponse.json(data ?? DEFAULTS)
}

// ─── PATCH /api/user-preferences ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<UserPreferences>

  // Upsert — insert or update on conflict.
  // user_id se setea desde el server, no del body.
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        ...body,
        user_id:    user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('alerta_vencimientos_activa, alerta_vencimientos_dias, alerta_resumen_semanal, alerta_resumen_mensual')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
