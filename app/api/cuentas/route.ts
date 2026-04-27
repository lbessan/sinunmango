import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const id = 'cta_' + Date.now().toString(36)

  // Normalizar tipo_cuenta a los valores permitidos por el constraint de la BD.
  // Los valores 'Banco CA', 'Banco CC' y 'Billetera' son la nueva nomenclatura;
  // hasta ejecutar la migración SQL se mapean a 'Billetera/Banco'.
  const tipoNorm = (t: string) => ['Banco CA','Banco CC','Billetera'].includes(t) ? 'Billetera/Banco' : t
  const bodyNorm = { ...body, tipo_cuenta: tipoNorm(body.tipo_cuenta ?? '') }

  const { error } = await adminClient.from('cuentas').insert({ id, ...bodyNorm, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
