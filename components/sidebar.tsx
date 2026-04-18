import { LayoutDashboard, ArrowLeftRight, PlusCircle, CreditCard, Receipt, ShieldCheck, BarChart2, Settings, Mail } from 'lucide-react'
import { NavItem } from './nav-item'
import { LogoutButton } from './logout-button'
import { Tag } from 'lucide-react'

export function Sidebar() {
  return (
    <aside className="w-60 min-h-screen flex flex-col shrink-0" style={{ background: 'var(--sidebar-bg, #0d2137)' }}>

      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/8">
        <img
          src="/logo.png"
          alt="Logo"
          className="w-9 h-9 rounded-full"
        />
        <div>
          <p className="text-white font-semibold text-sm leading-tight">Finanzas LB</p>
          <p className="text-xs leading-tight" style={{ color: '#4ade80' }}>Bimonetario ARS/USD</p>
        </div>
      </div>

      <nav className="flex-1 py-3">
        <p className="text-xs uppercase tracking-widest px-5 py-2" style={{ color: '#4b6a8a' }}>
          Principal
        </p>
        <NavItem href="/dashboard"        icon={<LayoutDashboard size={17} />} label="Dashboard" />
        <NavItem href="/movimientos"      icon={<ArrowLeftRight size={17} />}  label="Movimientos" />
        <NavItem href="/movimientos/nuevo" icon={<PlusCircle size={17} />}     label="Nuevo movimiento" />
        <NavItem href="/importar"          icon={<Mail size={17} />}           label="Importar email" />
        <NavItem href="/categorias" icon={<Tag size={17} />} label="Categorías" />
        <NavItem href="/conciliaciones" icon={<ShieldCheck size={17} />} label="Conciliaciones" />
        <NavItem href="/analitica"      icon={<BarChart2 size={17} />}   label="Analítica" />

        <p className="text-xs uppercase tracking-widest px-5 py-2 mt-3" style={{ color: '#4b6a8a' }}>
          Configuración
        </p>
        <NavItem href="/cuentas"        icon={<CreditCard size={17} />} label="Cuentas" />
        <NavItem href="/gastos-fijos"   icon={<Receipt size={17} />}    label="Gastos fijos" />
        <NavItem href="/configuracion"  icon={<Settings size={17} />}   label="Configuración" />
      </nav>

      <div className="px-5 py-4 border-t border-white/8 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#4b6a8a' }}>
              Dólar BNA
            </p>
            <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>$ 1.410</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
        <LogoutButton />
      </div>

    </aside>
  )
}
