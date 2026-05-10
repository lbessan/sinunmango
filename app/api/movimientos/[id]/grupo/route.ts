import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /api/movimientos/[id]/grupo ─────────────────────────────────────────
// Devuelve las cuotas hermanas del movimiento (mismo grupo_cuotas).
// Usado por el form de editar para mostrar "se aplicará a N cuotas".
// Si el movimiento no tiene grupo_cuotas, devuelve un array vacío.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  // Obtener grupo_cuotas del movimiento actual
  const { data: actual } = await supabase
    .from('movimientos')
    .select('grupo_cuotas')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!actual?.grupo_cuotas) {
    return NextResponse.json({ cuotas: [] })
  }

  // Listar todas las cuotas del grupo (incluida la actual), ordenadas por fecha
  const { data: cuotas, error } = await supabase
    .from('movimientos')
    .select('id, fecha, detalle, monto, moneda, cuota_actual, cuotas_total, periodo_tarjeta, conciliado')
    .eq('grupo_cuotas', actual.grupo_cuotas)
    .eq('user_id', user.id)
    .order('cuota_actual', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ cuotas: cuotas ?? [] })
}
