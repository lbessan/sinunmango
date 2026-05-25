import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── GET /api/shareable-resources ────────────────────────────────────────────
//
// Devuelve los recursos compartibles del owner, para popular el picker del
// modal de compartir workspace. Un solo request en vez de 3 separados.

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [
    { data: cuentas },
    { data: gastosFijos },
    { data: inversiones },
  ] = await Promise.all([
    supabase.from('cuentas')
      .select('id, nombre_cuenta, tipo_cuenta, moneda')
      .eq('activa', true)
      .eq('user_id', user.id)
      .order('nombre_cuenta'),
    supabase.from('gastos_fijos')
      .select('id, nombre_gasto, monto_estimado, moneda')
      .eq('activo', true)
      .eq('user_id', user.id)
      .order('nombre_gasto'),
    supabase.from('inversiones')
      .select('id, nombre, tipo, moneda')
      .eq('user_id', user.id)
      .order('fecha_inicio', { ascending: false }),
  ])

  return NextResponse.json({
    cuentas:      cuentas ?? [],
    gastos_fijos: gastosFijos ?? [],
    inversiones:  inversiones ?? [],
  })
}
