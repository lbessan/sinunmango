import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { EditarCategoriaClient } from '@/components/editar-categoria-client'

export default async function EditarCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const { data: cat } = await adminClient.from('categorias').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!cat) notFound()

  return <EditarCategoriaClient categoria={cat} />
}
