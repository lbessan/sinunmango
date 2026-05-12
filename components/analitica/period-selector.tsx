'use client'

import { PRESET_LABELS, type Preset } from './utils'

export function PeriodSelector({
  preset,
  customDesde,
  customHasta,
  onPresetChange,
  onCustomDesdeChange,
  onCustomHastaChange,
}: {
  preset: Preset
  customDesde: string
  customHasta: string
  onPresetChange: (p: Preset) => void
  onCustomDesdeChange: (s: string) => void
  onCustomHastaChange: (s: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
        {(Object.keys(PRESET_LABELS) as Preset[]).map(p => (
          <button
            key={p}
            onClick={() => onPresetChange(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              preset === p
                ? 'text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
            style={preset === p ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
          <input
            type="date"
            value={customDesde}
            onChange={e => onCustomDesdeChange(e.target.value)}
            className="text-sm text-slate-700 outline-none bg-transparent"
          />
          <span className="text-slate-300 text-sm">→</span>
          <input
            type="date"
            value={customHasta}
            onChange={e => onCustomHastaChange(e.target.value)}
            className="text-sm text-slate-700 outline-none bg-transparent"
          />
        </div>
      )}
    </div>
  )
}
