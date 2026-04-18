import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'
import { notFound, redirect } from 'next/navigation'

export default async function EditarGastoFijoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params

  const [{ data: gasto }, { data: categorias }, { data: cuentas }] = await Promise.all([
    adminClient.from('gastos_fijos').select('*').eq('id', id).eq('user_id', user.id).single(),
    adminClient.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
    adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true).eq('user_id', user.id),
  ])

  if (!gasto) notFound()

  return (
    <GastoFijoFormClient
      inicial={{
        id: gasto.id,
        nombre_gasto: gasto.nombre_gasto ?? '',
        id_categoria: gasto.id_categoria ?? '',
        monto_estimado: String(gasto.monto_estimado ?? ''),
        moneda: gasto.moneda ?? 'ARS',
        dia_vencimiento: String(gasto.dia_vencimiento ?? ''),
        cuenta_pago_default: gasto.cuenta_pago_default ?? '',
        activo: gasto.activo ?? true,
      }}
      categorias={categorias ?? []}
      cuentas={cuentas ?? []}
    />
  )
}
