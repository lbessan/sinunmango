import { CuentaFormClient } from '@/components/cuenta-form-client'

export default function NuevaCuentaPage() {
  return (
    <CuentaFormClient
      inicial={{
        nombre_cuenta:     '',
        institucion:       '',
        moneda:            'ARS',
        tipo_cuenta:       'Billetera/Banco',
        saldo_inicial:     '0',
        activa:            true,
        imagen_url:        '',
        imagen_banner_url: '',
        color_primario:    '#0d3b6e',
      }}
    />
  )
}
