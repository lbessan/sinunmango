import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GastoFijoFormClient } from '@/components/gasto-fijo-form-client'

type Props = ComponentProps<typeof GastoFijoFormClient>

type SP = {
  nombre?:       string
  monto?:        string
  dia?:          string
  moneda?:       string
  cuenta?:       string
  categoria?:    string
  subcategoria?: string
}

// Crear gasto fijo: owner-only. Invitees no tienen botón "Nuevo gasto fijo"
// en /gastos-fijos (workspace.isOwn). URL directa muestra picker vacío.
//
// Soporta query params pre-llenados desde el flow de "sugerir gasto fijo"
// (post-save en /movimientos/nuevo): nombre, monto, dia, moneda, cuenta,
// categoria, subcategoria. Si no vienen, default vacío.
export default async function NuevoGastoFijoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const sp = await searchParams

  const [{ data: categorias }, { data: subcategorias }, { data: cuentas }] = await Promise.all([
    supabase.from('categorias').select('id, nombre_categoria, icono').eq('user_id', user.id).order('nombre_categoria'),
    supabase.from('subcategorias').select('id, categoria_padre, nombre_subcategoria').eq('user_id', user.id),
    supabase.from('cuentas').select('id, nombre_cuenta, tipo_cuenta').eq('activa', true).eq('user_id', user.id),
  ])

  return (
    <GastoFijoFormClient
      inicial={{
        nombre_gasto:        sp.nombre       ?? '',
        id_categoria:        sp.categoria    ?? '',
        id_subcategoria:     sp.subcategoria ?? '',
        monto_estimado:      sp.monto        ?? '',
        moneda:              (sp.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        dia_vencimiento:     sp.dia          ?? '',
        cuenta_pago_default: sp.cuenta       ?? '',
        activo: true,
      }}
      categorias={(categorias ?? []) as Props['categorias']}
      subcategorias={(subcategorias ?? []) as Props['subcategorias']}
      cuentas={(cuentas ?? []) as Props['cuentas']}
    />
  )
}
