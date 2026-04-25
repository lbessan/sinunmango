import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { TarjetaFormClient } from '@/components/tarjeta-form-client'
import { notFound, redirect } from 'next/navigation'

export default async function EditarTarjetaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const { data: t } = await adminClient
    .from('cuentas')
    .select('*')
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)
    .single()

  if (!t) notFound()

  return (
    <TarjetaFormClient
      inicial={{
        id:                t.id,
        nombre:            t.nombre_cuenta ?? '',
        banco_id:          '',
        banco_nombre:      t.institucion ?? '',
        banco_color:       t.color_primario ?? '#1e293b',
        network_id:        '',
        variant_id:        'standard',
        imagen_url:        t.imagen_url ?? '',
        color_primario:    t.color_primario ?? '#1e293b',
        fecha_cierre:      t.fecha_cierre_tarjeta ?? '',
        fecha_vencimiento: t.fecha_vencimiento_tarjeta ?? '',
        terminacion:       t.terminacion_tarjeta ?? '',
        activa:            t.activa ?? true,
      }}
    />
  )
}
