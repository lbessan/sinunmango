'use client'

import type { ReactNode } from 'react'

export function TabPlaceholder({
  fase,
  titulo,
  descripcion,
  icon,
}: {
  fase:        string
  titulo:      string
  descripcion: ReactNode
  icon?:       ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 lg:p-16 text-center">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-5">
          {icon}
        </div>
      )}
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{fase}</p>
      <h2 className="text-xl font-bold text-slate-700 mb-3">{titulo}</h2>
      <div className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
        {descripcion}
      </div>
    </div>
  )
}
