import { TarjetaFormClient } from '@/components/tarjeta-form-client'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NuevaTarjetaPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  // Candidatas para el dropdown "Tarjeta principal" si el user va a
  // crear una adicional. Filtramos: del user, tarjeta de crédito, activa,
  // que NO sea ya adicional (depth=1).
  const { data: candidatas } = await supabase
    .from('cuentas')
    .select('id, nombre_cuenta')
    .eq('user_id', user.id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .is('tarjeta_principal_id', null)
    .order('nombre_cuenta')

  return (
    <TarjetaFormClient
      inicial={{
        nombre:                '',
        banco_id:              '',
        banco_nombre:          '',
        banco_color:           '#1e293b',
        network_id:            '',
        variant_id:            'standard',
        imagen_url:            '',
        color_primario:        '#1e293b',
        fecha_cierre:          '',
        fecha_vencimiento:     '',
        terminacion:           '',
        activa:                true,
        tarjeta_principal_id:  '',
        nombre_titular:        '',
      }}
      candidatasPrincipal={(candidatas ?? []) as Array<{ id: string; nombre_cuenta: string }>}
    />
  )
}
