import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'

export default async function NuevoGastoFijoPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [{ data: categorias }, { data: cuentas }] = await Promise.all([
    adminClient.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
    adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true).eq('user_id', user.id),
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
