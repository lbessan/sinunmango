// ─── /configuracion/monotributo — Config del régimen ────────────────────────
// Server component que carga la config actual + lista de gastos fijos para
// el dropdown de vinculación, y renderiza el form en un componente cliente.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { MonotributoConfigForm } from './form'

export default async function MonotributoConfigPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: configRaw }, { data: gastosFijosRaw }] = await Promise.all([
    supabase.from('monotributo_config').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('gastos_fijos').select('id, nombre_gasto, dia_vencimiento')
      .eq('user_id', user.id).eq('activo', true).order('nombre_gasto'),
  ])

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={14} />Volver al dashboard
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">Configurar monotributo</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Ajustá tu categoría, límite anual y costo mensual. Los valores los actualizás
          a mano cada semestre cuando ARCA los modifica.
        </p>
      </div>

      <MonotributoConfigForm
        initialConfig={configRaw}
        gastosFijos={(gastosFijosRaw ?? []) as { id: string; nombre_gasto: string; dia_vencimiento: number | null }[]}
      />
    </div>
  )
}
