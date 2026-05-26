import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { getCurrentWorkspace } from '@/lib/workspace'
import { notFound, redirect } from 'next/navigation'
import { EditarMovimientoClient } from '@/components/editar-movimiento-client'

type Props = ComponentProps<typeof EditarMovimientoClient>

export default async function EditarMovimientoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId

  const { id } = await params

  // El mov: sin filtro user_id → RLS decide (puede ser propio o en cuenta compartida).
  // Pickers: scope al workspace (owner) para que el invitee vea las cuentas/cats del owner.
  const [{ data: mov }, { data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      supabase.from('movimientos').select('*').eq('id', id).single(),
      supabase.from('cuentas').select('id, nombre_cuenta, tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta').eq('activa', true).eq('user_id', wsId),
      supabase.from('categorias').select('id, nombre_categoria, icono, tipo_default').eq('user_id', wsId).order('nombre_categoria'),
      supabase.from('subcategorias').select('id, categoria_padre, nombre_subcategoria').eq('user_id', wsId),
    ])

  if (!mov) notFound()

  return (
    <EditarMovimientoClient
      movimiento={mov as Props['movimiento']}
      cuentas={(cuentas ?? []) as Props['cuentas']}
      categorias={(categorias ?? []) as Props['categorias']}
      subcategorias={(subcategorias ?? []) as Props['subcategorias']}
    />
  )
}
