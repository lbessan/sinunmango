import { Sidebar } from '@/components/sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/app-shell'
import { ManguitoFlotante } from '@/components/manguito-flotante'
import { IOSInstallBanner } from '@/components/ios-install-banner'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  // Onboarding gate: si el usuario no tiene cuentas activas, lo mandamos al onboarding.
  // RLS filtra automático por user_id; el .eq() se mantiene como defensa.
  const { count } = await supabase
    .from('cuentas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('activa', true)

  if (!count || count === 0) redirect('/onboarding')

  return (
    <ThemeProvider>
      <AppShell sidebar={<Sidebar />}>
        {children}
      </AppShell>
      <ManguitoFlotante />
      <IOSInstallBanner />
    </ThemeProvider>
  )
}
