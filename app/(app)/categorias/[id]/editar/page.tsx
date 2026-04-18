import { adminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { EditarCategoriaClient } from '@/components/editar-categoria-client'

export default async function EditarCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: cat } = await adminClient.from('categorias').select('*').eq('id', id).single()
  if (!cat) notFound()

  return <EditarCategoriaClient categoria={cat} />
}
