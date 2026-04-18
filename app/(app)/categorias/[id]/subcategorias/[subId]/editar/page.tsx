import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { EditarSubcategoriaClient } from '@/components/editar-subcategoria-client'

export default async function EditarSubcategoriaPage({
  params,
}: {
  params: Promise<{ catId: string; subId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { catId, subId } = await params

  const [{ data: sub }, { data: categorias }] = await Promise.all([
    adminClient
      .from('subcategorias')
      .select('*')
      .eq('id', subId)
      .eq('user_id', user.id)
      .single(),
    adminClient
      .from('categorias')
      .select('id, nombre_categoria, icono')
      .eq('user_id', user.id)
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
