import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { ConectorAfip } from '../conectar-afip'

type Datos = {
  categoria: string | null
  descripcionCategoria: string | null
  periodo: string | null
  actividad: string | null
  activo: boolean
}

export default async function ConectarAfipPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data: conexion } = await supabase
    .from('afip_conexion')
    .select('cuit, cert_cipher, ultima_sync, sync_data, sync_error, estado')
    .eq('user_id', user.id)
    .maybeSingle()

  const raw = conexion?.sync_data as Partial<Datos> | null
  const datos: Datos | null = raw && typeof raw === 'object'
    ? {
        categoria: raw.categoria ?? null,
        descripcionCategoria: raw.descripcionCategoria ?? null,
        periodo: raw.periodo ?? null,
        actividad: raw.actividad ?? null,
        activo: raw.activo ?? false,
      }
    : null

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link href="/configuracion/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={15} /> Volver a Monotributo
      </Link>
      <h1 className="text-xl font-bold text-slate-800">Conectar con AFIP</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Leé tu categoría directo de AFIP con tu certificado digital — sin clave fiscal ni servicios de terceros.
      </p>
      <ConectorAfip
        yaConectado={!!conexion?.cert_cipher}
        cuitInicial={conexion?.cuit ?? ''}
        ultimaSync={conexion?.ultima_sync ?? null}
        datosIniciales={datos}
        syncError={conexion?.estado === 'error' ? (conexion?.sync_error ?? null) : null}
      />
    </div>
  )
}
