import { Sidebar } from '@/components/sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/app-shell'
import { ManguitoFlotante } from '@/components/manguito-flotante'
import { getCurrentUser } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Onboarding gate: si el usuario no tiene cuentas activas, lo mandamos al onboarding
  const { count } = await adminClient
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
    </ThemeProvider>
  )
}
