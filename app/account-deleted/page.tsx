import { redirect } from 'next/navigation'
import Image from 'next/image'
import { getAuthedClient } from '@/lib/supabase/server'
import { AccountDeletedClient } from './client'

// ─── /account-deleted ─────────────────────────────────────────────────────────
//
// Pantalla que ve el user cuando vuelve a loguear durante el grace period
// de 30 días después de pedir eliminar su cuenta.
//
// Server component: valida que el user esté autenticado Y que tenga
// deleted_at NOT NULL en user_profiles. Cualquier otro caso → redirect.
// Calcula los días restantes para la purga definitiva y los pasa al client.

const GRACE_DAYS = 30

export default async function AccountDeletedPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('deleted_at')
    .eq('user_id', user.id)
    .maybeSingle()

  // Si no está marcada como deleted, no debería estar acá → al dashboard.
  if (!profile?.deleted_at) {
    redirect('/dashboard')
  }

  const deletedAt   = new Date(profile.deleted_at)
  const purgeAt     = new Date(deletedAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
  const daysLeft    = Math.max(0, Math.ceil((purgeAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="sinunmango" width={64} height={64} className="w-16 h-16 mx-auto mb-4 object-contain" priority />
          <p className="text-2xl font-bold">
            <span className="text-slate-800">sinun</span><span style={{ color: '#f97316' }}>mango</span>
          </p>
        </div>

        <AccountDeletedClient
          email={user.email ?? ''}
          daysLeft={daysLeft}
          purgeDate={purgeAt.toISOString()}
        />
      </div>
    </div>
  )
}
