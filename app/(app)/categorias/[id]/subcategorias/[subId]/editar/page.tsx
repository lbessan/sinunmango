import { adminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { EditarSubcategoriaClient } from '@/components/editar-subcategoria-client'

export default async function EditarSubcategoriaPage({
  params,
}: {
  params: Promise<{ catId: string; subId: string }>
}) {
  const { catId, subId } = await params

  const [{ data: sub }, { data: categorias }] = await Promise.all([
    adminClient
      .from('subcategorias')
      .select('*')
      .eq('id', subId)
      .single(),
    adminClient
      .from('categorias')
      .select('id, nombre_categoria, icono')
      .order('nombre_categoria'),
  ])

  if (!sub) notFound()

  return (
    <EditarSubcategoriaClient
      subcategoria={sub}
      categorias={categorias ?? []}
      catIdActual={catId}
    />
  )
}
