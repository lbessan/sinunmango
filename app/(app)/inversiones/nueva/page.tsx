import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { InversionFormClient } from '@/components/inversion-form-client'

export default async function NuevaInversionPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [{ data: cuentas }, { data: categorias }, { data: params }] = await Promise.all([
    adminClient
      .from('cuentas')
      .select('id, nombre_cuenta, tipo_cuenta')
      .eq('activa', true)
      .eq('user_id', user.id)
      .order('nombre_cuenta'),
    adminClient
      .from('categorias')
      .select('id, nombre_categoria, tipo_default')
      .eq('user_id', user.id)
      .order('nombre_categoria'),
    adminClient
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
        cuentas={cuentas ?? []}
        categorias={categorias ?? []}
        dolar={params?.valor ?? 1410}
      />
    </div>
  )
}
