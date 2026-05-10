import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [{ data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      supabase.from('cuentas').select('*').eq('activa', true).eq('user_id', user.id),
      supabase.from('categorias').select('*').order('nombre_categoria').eq('user_id', user.id),
      supabase.from('subcategorias').select('*').eq('user_id', user.id),
    ])

  return NextResponse.json({ cuentas, categorias, subcategorias })
}
