import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BancosClient } from './bancos-client'

export default async function BancosPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Traemos todas las cuentas del usuario (incluyendo tarjetas)
  const { data: cuentas } = await adminClient
    .from('cuentas')
    .select('id, nombre_cuenta, institucion, tipo_cuenta, imagen_url, imagen_banner_url, color_primario, activa')
    .eq('user_id', user.id)
    .order('institucion')
    .order('nombre_cuenta')

  return <BancosClient cuentas={cuentas ?? []} />
}
