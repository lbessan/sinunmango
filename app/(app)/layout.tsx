import { Sidebar } from '@/components/sidebar'
import { ThemeProvider } from '@/components/theme-provider'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 p-8 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </ThemeProvider>
  )
}