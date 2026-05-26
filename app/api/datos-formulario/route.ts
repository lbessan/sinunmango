import { createClientForRequest } from '@/lib/supabase/route'
import { getCurrentWorkspace } from '@/lib/workspace'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId

  // Pickers del form de mov: scope al workspace (owner) — el invitee con role
  // editor ve las cuentas/cats del owner para poder cargar movs en cuentas
  // compartidas. Si el invitee no es editor, RLS bloqueará el insert igual.
  const [{ data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      supabase.from('cuentas').select('*').eq('activa', true).eq('user_id', wsId),
      supabase.from('categorias').select('*').order('nombre_categoria').eq('user_id', wsId),
      supabase.from('subcategorias').select('*').eq('user_id', wsId),
    ])

  return NextResponse.json({ cuentas, categorias, subcategorias })
}
