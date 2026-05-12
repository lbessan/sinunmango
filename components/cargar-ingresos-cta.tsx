'use client'

// ─── CTA pequeño para abrir el modal de cargar ingresos futuros ──────────────

import { useState } from 'react'
import { PlusCircle } from 'lucide-react'
import {
  CargarIngresosModal,
  type CuentaParaIngreso,
  type CategoriaParaIngreso,
} from './cargar-ingresos-modal'

export function CargarIngresosCTA({
  cuentas,
  categorias,
  variant = 'banner',
}: {
  cuentas:    CuentaParaIngreso[]
  categorias: CategoriaParaIngreso[]
  variant?:   'banner' | 'inline'
}) {
  const [open, setOpen] = useState(false)

  if (variant === 'inline') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow transition-shadow"
          style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
        >
          <PlusCircle size={14} /> Cargar ingresos futuros
        </button>
        <CargarIngresosModal open={open} onClose={() => setOpen(false)} cuentas={cuentas} categorias={categorias} />
      </>
    )
  }

  // banner variant
  return (
    <>
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/70 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 mb-0.5">¿Querés proyecciones más precisas?</p>
            <p className="text-xs text-slate-600">
              Cargá tus ingresos futuros (sueldo, freelances, alquileres) de un saque y vas a ver cómo
              cambia tu proyección mes a mes.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap shrink-0"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
          >
            <PlusCircle size={14} /> Cargar ingresos
          </button>
        </div>
      </div>
      <CargarIngresosModal open={open} onClose={() => setOpen(false)} cuentas={cuentas} categorias={categorias} />
    </>
  )
}
