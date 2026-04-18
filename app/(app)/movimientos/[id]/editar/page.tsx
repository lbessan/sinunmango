import { adminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { EditarMovimientoClient } from '@/components/editar-movimiento-client'

export default async function EditarMovimientoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [{ data: mov }, { data: cuentas }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      adminClient.from('movimientos').select('*').eq('id', id).single(),
      adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta').eq('activa', true),
      adminClient.from('categorias').select('id, nombre_categoria, icono, tipo_default').order('nombre_categoria'),
      adminClient.from('subcategorias').select('id, categoria_padre, nombre_subcategoria'),
    ])

  if (!mov) notFound()

  return (
    <EditarMovimientoClient
      movimiento={mov}
      cuentas={cuentas ?? []}
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
    />
  )
}
