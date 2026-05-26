import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'
import { notFound, redirect } from 'next/navigation'

type Props = ComponentProps<typeof GastoFijoFormClient>

// Editar gasto fijo: owner-only. Si el invitee llega acá por URL directa, RLS
// + filtro user.id devuelve notFound. Edit buttons en /gastos-fijos están
// ocultos para invitees (workspace.isOwn).
export default async function EditarGastoFijoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { id } = await params

  const [{ data: gasto }, { data: categorias }, { data: subcategorias }, { data: cuentas }] = await Promise.all([
    supabase.from('gastos_fijos').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
    supabase.from('subcategorias').select('id, categoria_padre, nombre_subcategoria').eq('user_id', user.id),
    supabase.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true).eq('user_id', user.id),
  ])

  if (!gasto) notFound()

  return (
    <GastoFijoFormClient
      inicial={{
        id: gasto.id,
        nombre_gasto: gasto.nombre_gasto ?? '',
        id_categoria: gasto.id_categoria ?? '',
        id_subcategoria: gasto.id_subcategoria ?? '',
        monto_estimado: String(gasto.monto_estimado ?? ''),
        moneda: gasto.moneda ?? 'ARS',
        dia_vencimiento: String(gasto.dia_vencimiento ?? ''),
        cuenta_pago_default: gasto.cuenta_pago_default ?? '',
        activo: gasto.activo ?? true,
      }}
      categorias={(categorias ?? []) as Props['categorias']}
      subcategorias={(subcategorias ?? []) as Props['subcategorias']}
      cuentas={(cuentas ?? []) as Props['cuentas']}
    />
  )
}
