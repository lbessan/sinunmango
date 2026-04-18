import { adminClient } from '@/lib/supabase/admin'
import { CategoriasClient } from '@/components/categorias-client'

export default async function CategoriasPage() {
  const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
    adminClient.from('categorias').select('*').order('tipo_default').order('nombre_categoria'),
    adminClient.from('subcategorias').select('*').order('nombre_subcategoria'),
  ])

  return (
    <CategoriasClient
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
    />
  )
}
