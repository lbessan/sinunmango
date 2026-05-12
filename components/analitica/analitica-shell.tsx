'use client'

import { useState } from 'react'
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle,
  GitBranch, Activity, Layers,
} from 'lucide-react'
import { TabResumen }       from './tab-resumen'
import { TabGastos }        from './tab-gastos'
import { TabIngresos }      from './tab-ingresos'
import { TabFlujo }         from './tab-flujo'
import { TabPatrones }      from './tab-patrones'
import { TabPredicciones }  from './tab-predicciones'
import type { MovAnalitica, Subcategoria } from './utils'

type TabKey = 'resumen' | 'gastos' | 'ingresos' | 'flujo' | 'patrones' | 'predicciones'

const TABS: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'resumen',      label: 'Resumen',      icon: LayoutDashboard },
  { key: 'gastos',       label: 'Gastos',       icon: ArrowDownCircle },
  { key: 'ingresos',     label: 'Ingresos',     icon: ArrowUpCircle   },
  { key: 'flujo',        label: 'Flujo',        icon: GitBranch       },
  { key: 'patrones',     label: 'Patrones',     icon: Activity        },
  { key: 'predicciones', label: 'Predicciones', icon: Layers          },
]

export type CuentaItem    = { id: string; nombre_cuenta: string | null; tipo_cuenta: string | null }
export type CategoriaItem = { id: string; nombre_categoria: string | null; icono: string | null; tipo_default: string | null }

export function AnaliticaShell({
  movimientos,
  subcategorias,
  cuentas,
  categorias,
  hasProAccess,
}: {
  movimientos:   MovAnalitica[]
  subcategorias: Subcategoria[]
  cuentas:       CuentaItem[]
  categorias:    CategoriaItem[]
  hasProAccess:  boolean
}) {
  const [tab, setTab] = useState<TabKey>('resumen')

  return (
    <div className="space-y-6">
      {/* ── Tabs nav ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-1.5 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
                style={active ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
              >
                <Icon size={15} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      {tab === 'resumen'  && <TabResumen  movimientos={movimientos} hasProAccess={hasProAccess} />}
      {tab === 'gastos'   && <TabGastos   movimientos={movimientos} subcategorias={subcategorias} hasProAccess={hasProAccess} />}

      {tab === 'ingresos' && <TabIngresos movimientos={movimientos} />}

      {tab === 'flujo' && <TabFlujo movimientos={movimientos} />}

      {tab === 'patrones'     && <TabPatrones     movimientos={movimientos} />}
      {tab === 'predicciones' && <TabPredicciones movimientos={movimientos} />}
    </div>
  )
}
