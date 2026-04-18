import { adminClient } from '@/lib/supabase/admin'
import { CuentaFormClient } from '@/components/cuenta-form-client'
import { notFound } from 'next/navigation'

export default async function EditarCuentaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: cuenta } = await adminClient
    .from('cuentas')
    .select('*')
    .eq('id', id)
    .single()

  if (!cuenta) notFound()

  return (
    <CuentaFormClient
      inicial={{
        id:                        cuenta.id,
        nombre_cuenta:             cuenta.nombre_cuenta ?? '',
        institucion:               cuenta.institucion ?? '',
        moneda:                    cuenta.moneda ?? 'ARS',
        tipo_cuenta:               cuenta.tipo_cuenta ?? 'Billetera/Banco',
        saldo_inicial:             String(cuenta.saldo_inicial ?? 0),
        fecha_cierre_tarjeta:      cuenta.fecha_cierre_tarjeta ?? '',
        fecha_vencimiento_tarjeta: cuenta.fecha_vencimiento_tarjeta ?? '',
        terminacion_tarjeta:       cuenta.terminacion_tarjeta ?? '',
        activa:                    cuenta.activa ?? true,
        imagen_url:                cuenta.imagen_url ?? '',
        imagen_banner_url:         cuenta.imagen_banner_url ?? '',
        color_primario:            cuenta.color_primario ?? '#0d3b6e',  // nunca null
      }}
    />
  )
}
