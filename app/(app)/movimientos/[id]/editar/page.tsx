import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
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

  const { id } = await params

  const [{ data: mov }, { data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      supabase.from('movimientos').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('cuentas').select('id, nombre_cuenta, tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta').eq('activa', true).eq('user_id', user.id),
      supabase.from('categorias').select('id, nombre_categoria, icono, tipo_default').eq('user_id', user.id).order('nombre_categoria'),
      supabase.from('subcategorias').select('id, categoria_padre, nombre_subcategoria').eq('user_id', user.id),
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
