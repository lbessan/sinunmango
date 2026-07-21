import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { SincronizarAfip } from '../sincronizar-afip'

export default async function ConectarAfipPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data: conexion } = await supabase
    .from('afip_conexion')
    .select('cuit, clave_cipher, ultima_sync, estado, sync_error')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link href="/configuracion/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={15} /> Volver a Monotributo
      </Link>
      <h1 className="text-xl font-bold text-slate-800">Conectar con AFIP</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Traé tu categoría, facturación, tope y cuota directo de ARCA — sin cargar nada a mano.
      </p>
      <SincronizarAfip
        cuitInicial={conexion?.cuit ?? ''}
        claveGuardada={!!conexion?.clave_cipher}
        ultimaSync={conexion?.ultima_sync ?? null}
        estadoError={conexion?.estado === 'error'}
        syncError={conexion?.sync_error ?? null}
      />
    </div>
  )
}
