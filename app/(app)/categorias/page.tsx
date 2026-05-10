import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CategoriasClient } from '@/components/categorias-client'

export default async function CategoriasPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase.from('categorias').select('*').eq('user_id', user.id).order('tipo_default').order('nombre_categoria'),
    supabase.from('subcategorias').select('*').eq('user_id', user.id).order('nombre_subcategoria'),
  ])

  return (
    <CategoriasClient
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
    />
  )
}
