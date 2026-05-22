import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SuscripcionClient } from './client'

// ─── /configuracion/suscripcion ─────────────────────────────────────────────
//
// Server component: valida auth y delega al client. El client llama a
// /api/billing/mp/status para mostrar el estado fresco + maneja el
// botón de cancelar.

export default async function SuscripcionPage() {
  const { user } = await getAuthedClient()
  if (!user) redirect('/login')
  return <SuscripcionClient />
}
