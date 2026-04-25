import { LayoutDashboard, ArrowLeftRight, PlusCircle, CreditCard, Receipt, ShieldCheck, BarChart2, Settings, Bot } from 'lucide-react'
import { NavItem } from './nav-item'
import { LogoutButton } from './logout-button'
import { DarkModeToggle } from './dark-mode-toggle'
import { Tag } from 'lucide-react'

async function getDolarBNA(): Promise<number> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      next: { revalidate: 3600 }, // cache 1 hora
    })
    if (!res.ok) return 0
    const data = await res.json()
    // dolarapi devuelve { compra, venta } — usamos venta (tipo vendedor BNA)
    return Math.round(data.venta ?? data.compra ?? 0)
  } catch {
    return 0
  }
}

export async function Sidebar() {
  const dolarBna = await getDolarBNA()
  return (
    <aside className="w-64 h-screen sticky top-0 flex flex-col shrink-0" style={{ background: 'var(--sidebar-bg, #0d2137)' }}>

      {/* Header */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/8">
        <img
          src="/logo.png"
          alt="Logo"
          className="w-12 h-12 object-contain"
        />
        <p className="font-bold text-base leading-tight">
          <span className="text-white">sinun</span><span style={{ color: '#f97316' }}>mango</span>
        </p>
      </div>

      {/* Nav — crece para empujar el footer al fondo */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <p className="text-xs uppercase tracking-widest px-5 py-2" style={{ color: '#4b6a8a' }}>
          Principal
        </p>
        <NavItem href="/dashboard"         icon={<LayoutDashboard size={17} />} label="Dashboard" />
        <NavItem href="/movimientos"       icon={<ArrowLeftRight size={17} />}  label="Movimientos" />
        <NavItem href="/movimientos/nuevo" icon={<PlusCircle size={17} />}      label="Nuevo movimiento" />
<NavItem href="/categorias"        icon={<Tag size={17} />}             label="Categorías" />
        <NavItem href="/conciliaciones"    icon={<ShieldCheck size={17} />}     label="Conciliaciones" />
        <NavItem href="/analitica"         icon={<BarChart2 size={17} />}       label="Analítica" />
        <NavItem href="/asistente"         icon={<Bot size={17} />}             label="Manguito" />

        <p className="text-xs uppercase tracking-widest px-5 py-2 mt-3" style={{ color: '#4b6a8a' }}>
          Configuración
        </p>
        <NavItem href="/cuentas"       icon={<CreditCard size={17} />} label="Cuentas" />
        <NavItem href="/tarjetas"      icon={<CreditCard size={17} />} label="Tarjetas" />
        <NavItem href="/gastos-fijos"  icon={<Receipt size={17} />}    label="Gastos fijos" />
        <NavItem href="/configuracion" icon={<Settings size={17} />}   label="Configuración" />
      </nav>

      {/* Footer — siempre visible al fondo */}
      <div className="px-4 py-4 border-t border-white/8 space-y-3">
        {/* Toggle Claro / Oscuro */}
        <DarkModeToggle />

        {/* Dólar BNA */}
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
