import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Normalizar tipo_cuenta igual que en POST
  const tipoNorm = (t: string) => ['Banco CA','Banco CC','Billetera'].includes(t) ? 'Billetera/Banco' : t
  const bodyNorm = body.tipo_cuenta ? { ...body, tipo_cuenta: tipoNorm(body.tipo_cuenta) } : body

  const { error } = await adminClient
    .from('cuentas')
    .update(bodyNorm)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  // Soft-delete: desactivar la cuenta en lugar de eliminarla
  // para preservar el historial de movimientos
  const { error } = await adminClient
    .from('cuentas')
    .update({ activa: false })
    .eq('id', id)
    .eq('user_id', user.id)
    .neq('tipo_cuenta', 'Tarjeta Credito') // las tarjetas tienen su propio endpoint

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
