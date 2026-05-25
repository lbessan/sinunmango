import { Sidebar } from '@/components/sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/app-shell'
import { ManguitoFlotante } from '@/components/manguito-flotante'
import { IOSInstallBanner } from '@/components/ios-install-banner'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentWorkspace } from '@/lib/workspace'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  // Soft-delete gate: si la cuenta está marcada como deleted_at (pendiente
  // de purga por el cron), mostrar la pantalla de recuperación en vez del
  // dashboard. El user todavía tiene sesión Supabase válida porque auth.users
  // sigue existiendo — solo user_profiles.deleted_at está seteado.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('deleted_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.deleted_at) {
    redirect('/account-deleted')
  }

  // Onboarding gate: si el usuario no tiene cuentas activas, lo mandamos al onboarding.
  // RLS filtra automático por user_id; el .eq() se mantiene como defensa.
  const { count } = await supabase
    .from('cuentas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('activa', true)

  if (!count || count === 0) redirect('/onboarding')

  // Manguito (asistente IA) NO disponible para invitees en workspaces
  // ajenos — privacy de la data del owner. En V2 podemos agregarlo con
  // contexto filtrado por share_resources.
  const workspace = await getCurrentWorkspace(user.id)
  const showManguito = workspace.isOwn

  return (
    <ThemeProvider>
      <AppShell sidebar={<Sidebar />}>
        {children}
      </AppShell>
      {showManguito && <ManguitoFlotante />}
      <IOSInstallBanner />
    </ThemeProvider>
  )
}
