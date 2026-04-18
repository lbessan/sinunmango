import { adminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const [{ data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      adminClient.from('cuentas').select('*').eq('activa', true),
      adminClient.from('categorias').select('*').order('nombre_categoria'),
      adminClient.from('subcategorias').select('*'),
    ])

  return NextResponse.json({ cuentas, categorias, subcategorias })
}
