import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [{ data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      adminClient.from('cuentas').select('*').eq('activa', true).eq('user_id', user.id),
      adminClient.from('categorias').select('*').order('nombre_categoria').eq('user_id', user.id),
      adminClient.from('subcategorias').select('*').eq('user_id', user.id),
    ])

  return NextResponse.json({ cuentas, categorias, subcategorias })
}
