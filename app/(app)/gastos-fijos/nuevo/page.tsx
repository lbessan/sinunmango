import { adminClient } from '@/lib/supabase/admin'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'

export default async function NuevoGastoFijoPage() {
  const [{ data: categorias }, { data: cuentas }] = await Promise.all([
    adminClient.from('categorias').select('id, nombre_categoria, icono').order('nombre_categoria'),
    adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true),
  ])

  return (
    <GastoFijoFormClient
      inicial={{
        nombre_gasto: '',
        id_categoria: '',
        monto_estimado: '',
        moneda: 'ARS',
        dia_vencimiento: '',
        cuenta_pago_default: '',
        activo: true,
      }}
      categorias={categorias ?? []}
      cuentas={cuentas ?? []}
    />
  )
}
