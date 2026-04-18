import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CategoriasClient } from '@/components/categorias-client'

export default async function CategoriasPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
    adminClient.from('categorias').select('*').eq('user_id', user.id).order('tipo_default').order('nombre_categoria'),
    adminClient.from('subcategorias').select('*').eq('user_id', user.id).order('nombre_subcategoria'),
  ])

  return (
    <CategoriasClient
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
    />
  )
}
