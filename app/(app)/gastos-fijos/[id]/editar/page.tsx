import { adminClient } from '@/lib/supabase/admin'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'
import { notFound } from 'next/navigation'

export default async function EditarGastoFijoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [{ data: gasto }, { data: categorias }, { data: cuentas }] = await Promise.all([
    adminClient.from('gastos_fijos').select('*').eq('id', id).single(),
    adminClient.from('categorias').select('id, nombre_categoria, icono').order('nombre_categoria'),
    adminClient.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true),
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
