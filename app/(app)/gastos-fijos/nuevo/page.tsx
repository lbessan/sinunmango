import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'

export default async function NuevoGastoFijoPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: categorias }, { data: subcategorias }, { data: cuentas }] = await Promise.all([
    supabase.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
    supabase.from('subcategorias').select('id, categoria_padre, nombre_subcategoria').eq('user_id', user.id),
    supabase.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true).eq('user_id', user.id),
  ])

  return (
    <GastoFijoFormClient
      inicial={{
        nombre_gasto: '',
        id_categoria: '',
        id_subcategoria: '',
        monto_estimado: '',
        moneda: 'ARS',
        dia_vencimiento: '',
        cuenta_pago_default: '',
        activo: true,
      }}
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
      cuentas={cuentas ?? []}
    />
  )
}
