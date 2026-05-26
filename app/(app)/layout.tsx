import { Sidebar } from '@/components/sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/app-shell'
import { ManguitoFlotante } from '@/components/manguito-flotante'
import { IOSInstallBanner } from '@/components/ios-install-banner'
import { WorkspaceBanner } from '@/components/workspace-banner'
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
  // EXCEPCIÓN: si el user es invitee en algún workspace ajeno (tiene shares
  // aceptados), no lo mandamos al onboarding — su flujo es entrar y switchear
  // al workspace recibido.
  const [{ count: ownCuentasCount }, { count: sharesCount }] = await Promise.all([
    supabase.from('cuentas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('activa', true),
    supabase.from('shares')
      .select('id', { count: 'exact', head: true })
      .eq('invitee_user_id', user.id)
      .not('accepted_at', 'is', null)
      .is('revoked_at', null),
  ])

  const hasOwnCuentas = (ownCuentasCount ?? 0) > 0
  const hasIncomingShare = (sharesCount ?? 0) > 0
  if (!hasOwnCuentas && !hasIncomingShare) {
    redirect('/onboarding')
  }

  // Manguito (asistente IA) NO disponible para invitees en workspaces
  // ajenos — privacy de la data del owner. En V2 podemos agregarlo con
  // contexto filtrado por share_resources.
  const workspace = await getCurrentWorkspace(user.id)
  const showManguito = workspace.isOwn

  return (
    <ThemeProvider>
      <AppShell sidebar={<Sidebar />}>
        {!workspace.isOwn && (
          <div className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-4 lg:mb-6">
            <WorkspaceBanner
              ownerEmail={workspace.ownerEmail ?? null}
              role={workspace.role ?? 'viewer'}
              myUserId={user.id}
            />
          </div>
        )}
        {children}
      </AppShell>
      {showManguito && <ManguitoFlotante />}
      <IOSInstallBanner />
    </ThemeProvider>
  )
}
