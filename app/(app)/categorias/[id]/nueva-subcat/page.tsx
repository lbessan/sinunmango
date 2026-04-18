import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { NuevaSubcatClient } from '@/components/nueva-subcat-client'

export default async function NuevaSubcatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const [{ data: cat }, { data: categorias }] = await Promise.all([
    adminClient.from('categorias').select('*').eq('id', id).eq('user_id', user.id).single(),
    adminClient.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
  ])
  if (!cat) notFound()
  return <NuevaSubcatClient categoriaPadre={cat} categorias={categorias ?? []} />
}
