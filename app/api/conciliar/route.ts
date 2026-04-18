import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cuentaId, periodo } = await req.json()

  if (!cuentaId || !periodo) {
    return NextResponse.json({ error: 'cuentaId y periodo son requeridos' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('movimientos')
    .update({ conciliado: true })
    .eq('cuenta_origen', cuentaId)
    .eq('periodo_tarjeta', periodo)
    .eq('tipo_movimiento', 'Gasto')
    .eq('conciliado', false)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
