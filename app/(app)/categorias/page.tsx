import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CategoriasClient } from '@/components/categorias-client'

type CatProps = ComponentProps<typeof CategoriasClient>

export default async function CategoriasPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase.from('categorias').select('*').eq('user_id', user.id).order('tipo_default').order('nombre_categoria'),
    supabase.from('subcategorias').select('*').eq('user_id', user.id).order('nombre_subcategoria'),
  ])

  return (
    <CategoriasClient
      categorias={(categorias ?? []) as CatProps['categorias']}
      subcategorias={(subcategorias ?? []) as CatProps['subcategorias']}
    />
  )
}
