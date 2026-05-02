import {
  LayoutDashboard, ArrowLeftRight, PlusCircle, CreditCard,
  Receipt, ShieldCheck, BarChart2, Settings,
  Landmark, Tag, Wallet, TrendingUp,
} from 'lucide-react'
import { NavItem }   from './nav-item'
import { NavGroup }  from './nav-group'
import { LogoutButton }   from './logout-button'
import { DarkModeToggle } from './dark-mode-toggle'

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
  return (
    <aside className="w-64 h-screen sticky top-0 flex flex-col shrink-0 overflow-x-hidden" style={{ background: 'var(--sidebar-bg, #0d2137)' }}>

      {/* Header */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/8">
        <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" />
        <p className="font-bold text-base leading-tight">
          <span className="text-white">sinun</span><span style={{ color: '#f97316' }}>mango</span>
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
        <p className="text-xs uppercase tracking-widest px-5 py-2" style={{ color: '#4b6a8a' }}>
          Principal
        </p>
        <NavItem href="/dashboard"         icon={<LayoutDashboard size={17} />} label="Dashboard"        tourId="tour-dashboard" />
        <NavItem href="/movimientos"       icon={<ArrowLeftRight size={17} />}  label="Movimientos"      tourId="tour-movimientos" />
        <NavItem href="/movimientos/nuevo" icon={<PlusCircle size={17} />}      label="Nuevo movimiento" />
        <NavItem href="/conciliaciones"    icon={<ShieldCheck size={17} />}     label="Conciliaciones" />
        <NavItem href="/analitica"         icon={<BarChart2 size={17} />}       label="Analítica" />

        <p className="text-xs uppercase tracking-widest px-5 py-2 mt-3" style={{ color: '#4b6a8a' }}>
          Mis cuentas
        </p>
        <NavItem href="/cuentas"      icon={<Wallet size={17} />}      label="Cuentas"      tourId="tour-cuentas" />
        <NavItem href="/tarjetas"     icon={<CreditCard size={17} />}  label="Tarjetas"     tourId="tour-tarjetas" />
        <NavItem href="/gastos-fijos" icon={<Receipt size={17} />}     label="Gastos fijos" />
        <NavItem href="/inversiones"  icon={<TrendingUp size={17} />}  label="Inversiones" />

        <p className="text-xs uppercase tracking-widest px-5 py-2 mt-3" style={{ color: '#4b6a8a' }}>
          Configuración
        </p>
        <NavGroup
          icon={<Settings size={17} />}
          label="Configuración"
          paths={['/configuracion', '/categorias']}
          tourId="tour-configuracion"
        >
          <NavItem href="/configuracion"        icon={<Settings  size={15} />} label="General"    exact />
          <NavItem href="/configuracion/bancos" icon={<Landmark  size={15} />} label="Bancos"     exact />
          <NavItem href="/categorias"           icon={<Tag       size={15} />} label="Categorías" exact />
        </NavGroup>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/8 space-y-3">
        <DarkModeToggle />
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
