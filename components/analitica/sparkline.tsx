'use client'

// ─── Sparkline ──────────────────────────────────────────────────────────────
// Mini chart de línea con área. Pensado para usar dentro de cards.

import { useId } from 'react'

export function Sparkline({
  data,
  width   = 80,
  height  = 28,
  color   = 'var(--accent, #1a6b5a)',
  fill    = true,
}: {
  data:   number[]
  width?: number
  height?: number
  color?: string
  fill?:  boolean
}) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="rounded bg-slate-50" />
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const xStep = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * xStep
    // Si todos los valores son iguales (range=0 originalmente, ahora 1), mostrar en el medio
    const y = max === min ? height / 2 : height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })

  const linePath = `M${points.join(' L')}`
  const areaPath = fill
    ? `M0,${height} L${points.join(' L')} L${width},${height} Z`
    : null

  // useId garantiza el mismo id en SSR y client (evita hydration mismatch)
  const rawId = useId()
  const gradId = `spark-${rawId.replace(/:/g, '')}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      {fill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
      )}
      {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Último punto */}
      {data.length > 0 && (
        <circle
          cx={(data.length - 1) * xStep}
          cy={(() => {
            const v = data[data.length - 1]
            return max === min ? height / 2 : height - ((v - min) / range) * (height - 4) - 2
          })()}
          r="1.8"
          fill={color}
        />
      )}
    </svg>
  )
}
