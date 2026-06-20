import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { FacturaForm, type FacturaFormData } from '../../factura-form'

export default async function EditarFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('facturas_emitidas')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) notFound()
  const factura = data as FacturaFormData

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={14} />Volver al dashboard
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">Editar factura</h1>
      </div>

      <FacturaForm initial={{ ...factura, id }} />
    </div>
  )
}
