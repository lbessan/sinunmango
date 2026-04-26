import { TarjetaFormClient } from '@/components/tarjeta-form-client'

export default function NuevaTarjetaPage() {
  return (
    <TarjetaFormClient
      inicial={{
        nombre:            '',
        banco_id:          '',
        banco_nombre:      '',
        banco_color:       '#1e293b',
        network_id:        '',
        variant_id:        'standard',
        imagen_url:        '',
        color_primario:    '#1e293b',
        fecha_cierre:      '',
        fecha_vencimiento: '',
        terminacion:       '',
        activa:            true,
      }}
    />
  )
}
