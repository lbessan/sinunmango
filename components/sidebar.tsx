import Image from 'next/image'
import {
  LayoutDashboard, ArrowLeftRight, PlusCircle, CreditCard,
  Receipt, ShieldCheck, BarChart2, Settings,
  Landmark, Tag, Wallet, TrendingUp, Sparkles, Users2,
  FileText,
} from 'lucide-react'
import { NavItem }   from './nav-item'
import { NavSection } from './nav-section'
import { LogoutButton }       from './logout-button'
import { DarkModeToggle }     from './dark-mode-toggle'
import { SidebarUsageWidget } from './sidebar-usage-widget'
import { WorkspaceSwitcher }  from './workspace-switcher'
import { getAuthedClient }    from '@/lib/supabase/server'
import { getUserPlan }        from '@/lib/subscription'

async function getDolarBNA(): Promise<number> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return 0
    const data = await res.json()
    return Math.round(data.venta ?? data.compra ?? 0)
  } catch {
    return 0
  }
}

export async function Sidebar() {
  const dolarBna = await getDolarBNA()
  const { supabase, user } = await getAuthedClient()
  const hasProAccess = user ? (await getUserPlan(supabase)).has_pro_access : false

  // Monotributo es opt-in: el item solo aparece si el user configuró su régimen.
  // Evita contaminar el sidebar para users que no son monotributistas.
  let hasMonotributo = false
  if (user) {
    const { data } = await supabase
      .from('monotributo_config')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    hasMonotributo = !!data
  }
  return (
    <aside className="w-64 h-screen sticky top-0 flex flex-col shrink-0 overflow-x-hidden" style={{ background: 'var(--sidebar-bg, #0d2137)' }}>

      {/* Header */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/8">
        <Image src="/logo.png" alt="Logo" width={48} height={48} className="w-12 h-12 object-contain" priority />
        <p className="font-bold text-base leading-tight">
          <span className="text-white">sinun</span><span style={{ color: '#f97316' }}>mango</span>
        </p>
      </div>

      {/* Workspace switcher — solo se renderea si el user tiene shares
          recibidos. Sino, silencioso (no clutter). */}
      <div className="pt-3">
        <WorkspaceSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
        <NavSection id="principal" label="Principal">
          <NavItem href="/dashboard"         icon={<LayoutDashboard size={17} />} label="Dashboard"        tourId="tour-dashboard" />
          <NavItem href="/movimientos"       icon={<ArrowLeftRight size={17} />}  label="Movimientos"      tourId="tour-movimientos" />
          <NavItem href="/movimientos/nuevo" icon={<PlusCircle size={17} />}      label="Nuevo movimiento" />
          <NavItem href="/conciliaciones"    icon={<ShieldCheck size={17} />}     label="Conciliaciones" />
          <NavItem href="/analitica"         icon={<BarChart2 size={17} />}       label="Analítica" />
          <NavItem href="/pro"               icon={<Sparkles size={17} />}        label="Pro" />
        </NavSection>

        <NavSection id="mis-cuentas" label="Mis cuentas" collapsible>
          <NavItem href="/cuentas"      icon={<Wallet size={17} />}      label="Cuentas"      tourId="tour-cuentas" />
          <NavItem href="/tarjetas"     icon={<CreditCard size={17} />}  label="Tarjetas"     tourId="tour-tarjetas" />
          <NavItem href="/gastos-fijos" icon={<Receipt size={17} />}     label="Gastos fijos" tourId="tour-gastos-fijos" />
          <NavItem href="/inversiones"  icon={<TrendingUp size={17} />}  label="Inversiones"  tourId="tour-inversiones" />
          {hasMonotributo && (
            <NavItem href="/monotributo" icon={<FileText size={17} />} label="Monotributo" />
          )}
        </NavSection>

        <NavSection id="configuracion" label="Configuración" collapsible>
          <NavItem href="/configuracion"             icon={<Settings  size={17} />} label="General"     exact />
          <NavItem href="/configuracion/bancos"      icon={<Landmark  size={17} />} label="Bancos"      exact />
          <NavItem href="/categorias"                icon={<Tag       size={17} />} label="Categorías"  exact />
          {/* "Compartidos" — anchor del tour para que el step de compartir
              workspace tenga dónde apuntar visualmente. */}
          <NavItem href="/configuracion/compartidos" icon={<Users2    size={17} />} label="Compartidos" exact tourId="tour-compartir" />
          {/* Monotributo siempre listado acá para que cualquier user pueda
              activarlo. Una vez configurado, también aparece en "Mis cuentas". */}
          <NavItem href="/configuracion/monotributo" icon={<FileText  size={17} />} label="Monotributo" exact />
        </NavSection>
      </nav>

      {/* Widget de cupos del mes (Free) o badge Pro */}
      <SidebarUsageWidget />

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/8 space-y-3">
        <DarkModeToggle hasProAccess={hasProAccess} />
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#4b6a8a' }}>
              Dólar BNA
            </p>
            <p className="text-base font-bold" style={{ color: '#4ade80' }}>
              {dolarBna > 0 ? `$ ${dolarBna.toLocaleString('es-AR')}` : '—'}
            </p>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
        <LogoutButton />
      </div>

    </aside>
  )
}
