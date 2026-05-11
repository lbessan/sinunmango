import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { InversionFormClient } from '@/components/inversion-form-client'

type Props = ComponentProps<typeof InversionFormClient>

export default async function NuevaInversionPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: cuentas }, { data: categorias }, { data: params }] = await Promise.all([
    supabase
      .from('cuentas')
      .select('id, nombre_cuenta, tipo_cuenta')
      .eq('activa', true)
      .eq('user_id', user.id)
      .order('nombre_cuenta'),
    supabase
      .from('categorias')
      .select('id, nombre_categoria, tipo_default')
      .eq('user_id', user.id)
      .order('nombre_categoria'),
    supabase
      .from('parametros')
      .select('valor')
      .eq('id', 'Dolar_Tarjeta_BNA')
      .eq('user_id', user.id)
      .single(),
  ])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/inversiones" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">Nueva inversión</h1>
      </div>

      <InversionFormClient
        cuentas={(cuentas ?? []) as Props['cuentas']}
        categorias={(categorias ?? []) as Props['categorias']}
        dolar={params?.valor ?? 1410}
      />
    </div>
  )
}
