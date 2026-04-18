import { adminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { NuevaSubcatClient } from '@/components/nueva-subcat-client'

export default async function NuevaSubcatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ data: cat }, { data: categorias }] = await Promise.all([
    adminClient.from('categorias').select('*').eq('id', id).single(),
    adminClient.from('categorias').select('id, nombre_categoria, icono').order('nombre_categoria'),
  ])
  if (!cat) notFound()
  return <NuevaSubcatClient categoriaPadre={cat} categorias={categorias ?? []} />
}
