import { getAuthedClient } from '@/lib/supabase/server'
import { CuentaFormClient } from '@/components/cuenta-form-client'
import { notFound, redirect } from 'next/navigation'

export default async function EditarCuentaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { id } = await params
  const { data: cuenta } = await supabase
    .from('cuentas')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cuenta) notFound()

  return (
    <CuentaFormClient
      inicial={{
        id:                  cuenta.id,
        nombre_cuenta:       cuenta.nombre_cuenta ?? '',
        institucion:         cuenta.institucion ?? '',
        moneda:              cuenta.moneda ?? 'ARS',
        tipo_cuenta:         cuenta.tipo_cuenta ?? 'Banco CA',
        saldo_inicial:       String(cuenta.saldo_inicial ?? 0),
        activa:              cuenta.activa ?? true,
        imagen_url:          cuenta.imagen_url ?? '',
        imagen_banner_url:   cuenta.imagen_banner_url ?? '',
        color_primario:      cuenta.color_primario ?? '#0d3b6e',
        terminacion_tarjeta: cuenta.terminacion_tarjeta ?? '',
      }}
    />
  )
}
