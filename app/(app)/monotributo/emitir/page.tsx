import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { EmitirFacturaForm } from './emitir-form'

export default async function EmitirPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data: conx } = await supabase
    .from('afip_conexion').select('cert_cipher').eq('user_id', user.id).maybeSingle()
  const conectado = !!conx?.cert_cipher

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <Link href="/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={15} /> Volver a Monotributo
      </Link>
      <h1 className="text-xl font-bold text-slate-800">Emitir factura</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Emití una Factura C directo por AFIP con tu certificado — se guarda con su CAE.
      </p>

      {conectado ? (
        <>
          <EmitirFacturaForm />
          <p className="text-xs text-slate-400 mt-6">
            ¿La factura ya la hiciste en otro lado?{' '}
            <Link href="/monotributo/nueva" className="text-slate-500 hover:underline">Cargala a mano</Link> (no la emite, solo la registra).
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          Para emitir necesitás conectar tu certificado en{' '}
          <Link href="/configuracion/monotributo/conectar" className="text-[color:var(--accent)] font-medium hover:underline">Conectar con AFIP</Link>.
          <br />
          <span className="text-slate-500">O <Link href="/monotributo/nueva" className="text-[color:var(--accent)] hover:underline">cargá una factura a mano</Link> sin emitirla.</span>
        </div>
      )}
    </div>
  )
}
