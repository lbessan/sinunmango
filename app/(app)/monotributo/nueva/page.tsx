import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { FacturaForm } from '../factura-form'

export default async function NuevaFacturaPage() {
  const { user } = await getAuthedClient()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={14} />Volver al dashboard
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">Nueva factura</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cargá una factura que emitiste — esto suma al acumulado de tu límite de monotributo.
        </p>
      </div>

      <FacturaForm />
    </div>
  )
}
