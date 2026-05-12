// ─── Insight card ────────────────────────────────────────────────────────────
// Card genérico para mostrar una métrica. Patrón:
//   [icon top-right]
//   LABEL pequeño
//   VALOR grande
//   subtitle (con color opcional)
//   [opcional: sparkline o bar al final]

import type { ReactNode } from 'react'

export type CardTone = 'neutral' | 'positive' | 'negative' | 'warning'

const TONE_STYLES: Record<CardTone, { subText: string; iconBg: string; iconColor: string }> = {
  neutral:  { subText: 'text-slate-500',   iconBg: 'bg-slate-50',    iconColor: 'text-slate-400'   },
  positive: { subText: 'text-emerald-600', iconBg: 'bg-emerald-50',  iconColor: 'text-emerald-500' },
  negative: { subText: 'text-red-600',     iconBg: 'bg-red-50',      iconColor: 'text-red-500'     },
  warning:  { subText: 'text-amber-600',   iconBg: 'bg-amber-50',    iconColor: 'text-amber-500'   },
}

export function InsightCard({
  label,
  value,
  sub,
  tone   = 'neutral',
  icon,
  footer,
  highlight,
}: {
  label:    string
  value:    ReactNode
  sub?:     ReactNode
  tone?:    CardTone
  icon?:    ReactNode
  footer?:  ReactNode      // Sparkline, bar, lo que sea
  highlight?: boolean      // Borde acentuado
}) {
  const s = TONE_STYLES[tone]
  return (
    <div className={`relative bg-white rounded-2xl p-5 border ${highlight ? 'border-slate-300 shadow-sm' : 'border-slate-100'}`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
        {icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.iconBg} ${s.iconColor}`}>
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-none mb-1.5 break-words">{value}</p>
      {sub && <p className={`text-xs font-medium leading-snug ${s.subText}`}>{sub}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  )
}

/** Hero card: versión más grande, full width, con narrative. */
export function HeroCard({
  label,
  value,
  sub,
  tone = 'neutral',
  detail,
}: {
  label:  string
  value:  ReactNode
  sub?:   ReactNode
  tone?:  CardTone
  detail?: ReactNode    // bloque a la derecha (subnúmeros, gráficos chicos)
}) {
  const s = TONE_STYLES[tone]
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 lg:p-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
          <p className="text-4xl lg:text-5xl font-black text-slate-800 leading-none mb-3 break-words">{value}</p>
          {sub && <p className={`text-sm font-medium ${s.subText}`}>{sub}</p>}
        </div>
        {detail && <div className="lg:text-right shrink-0">{detail}</div>}
      </div>
    </div>
  )
}
