import { getAuthedClient } from '@/lib/supabase/server'
import { TarjetaFormClient } from '@/components/tarjeta-form-client'
import { notFound, redirect } from 'next/navigation'
import { BANKS } from '@/constants/banks'

// Parsea imagen_url = /cards/{networkId}-{variantId}.png → { network_id, variant_id }
function parseCardUrl(url?: string | null): { network_id: string; variant_id: string } {
  if (!url) return { network_id: '', variant_id: 'standard' }
  const m = url.match(/\/cards\/([a-z]+)-([a-z]+)\.png/)
  if (!m) return { network_id: '', variant_id: 'standard' }
  return { network_id: m[1], variant_id: m[2] }
}

export default async function EditarTarjetaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { id } = await params
  const { data: t } = await supabase
    .from('cuentas')
    .select('*')
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)
    .single()

  if (!t) notFound()

  // Intentar detectar red y variante desde imagen_url almacenada
  const { network_id, variant_id } = parseCardUrl(t.imagen_url)

  // Intentar encontrar el banco por nombre de institución
  const banco = t.institucion
    ? BANKS.find(b =>
        b.nombre.toLowerCase() === t.institucion!.toLowerCase() ||
        t.institucion!.toLowerCase().includes(b.nombre.toLowerCase()) ||
        b.nombre.toLowerCase().includes(t.institucion!.toLowerCase())
      )
    : null

  // El cipher de password del resumen vive en la DB pero NUNCA se devuelve
  // al cliente. Solo exponemos un boolean para que el form sepa si ya hay
  // una guardada (mostrar "••••" + botón borrar/cambiar) vs vacío (mostrar
  // input "ingresá nueva").
  const cuentaRaw = t as unknown as { resumen_password_cipher?: string | null }
  const hasResumenPassword = !!cuentaRaw.resumen_password_cipher

  return (
    <TarjetaFormClient
      inicial={{
        id:                t.id,
        nombre:            t.nombre_cuenta ?? '',
        banco_id:          banco?.id ?? '',
        banco_nombre:      t.institucion ?? '',
        banco_color:       banco?.color ?? t.color_primario ?? '#1e293b',
        network_id,
        variant_id,
        imagen_url:        t.imagen_url ?? '',
        color_primario:    t.color_primario ?? '#1e293b',
        fecha_cierre:      t.fecha_cierre_tarjeta ?? '',
        fecha_vencimiento: t.fecha_vencimiento_tarjeta ?? '',
        terminacion:       t.terminacion_tarjeta ?? '',
        activa:            t.activa ?? true,
        has_resumen_password: hasResumenPassword,
      }}
    />
  )
}
