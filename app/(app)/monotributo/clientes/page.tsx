import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { ClientesManager } from './clientes-manager'

type Cliente = { id: string; nombre: string; doc_tipo: number | null; doc_nro: string | null }

export default async function ClientesPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: clientes }, { data: conx }] = await Promise.all([
    supabase.from('clientes').select('id, nombre, doc_tipo, doc_nro').eq('user_id', user.id).order('nombre'),
    supabase.from('afip_conexion').select('cert_cipher').eq('user_id', user.id).maybeSingle(),
  ])

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <Link href="/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={15} /> Volver a Monotributo
      </Link>
      <h1 className="text-xl font-bold text-slate-800">Clientes</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Tu libreta para facturar más rápido. Importá los de tus facturas o agregá por CUIT — el nombre lo traemos de AFIP.
      </p>
      <ClientesManager iniciales={(clientes ?? []) as Cliente[]} afipConectado={!!conx?.cert_cipher} />
    </div>
  )
}
