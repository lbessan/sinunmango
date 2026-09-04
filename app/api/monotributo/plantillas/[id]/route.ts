// ─── /api/monotributo/plantillas/[id] ────────────────────────────────────────
// DELETE → borra una plantilla del usuario. (Editar = POST con el mismo nombre.)

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await ctx.params

  const { error } = await supabase
    .from('factura_plantillas').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
