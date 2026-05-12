'use client'

// ─── Tab Gastos — Fase 2b/3 ──────────────────────────────────────────────────
//
// Enfocada en "qué gastaste":
//   1. Period selector
//   2. Gastos por categoría (donut interactivo + drill-down con cuotas agrupadas)
//   3. Variación mes a mes
//   4. Top compras individuales (cuotas agrupadas)
//   5. AI Deep Report (Pro, on-demand)
//
// Patrones comportamentales (anomalías, recurrentes, heatmap) viven en Patrones.

import { useState, useMemo } from 'react'
import { PeriodSelector }   from './period-selector'
import { PanelCategorias }  from './panel-categorias'
import { PanelTopGastos }   from './panel-top-gastos'
import { AIDeepReport }     from './ai-deep-report'
import { getDateRange, parseFecha, type MovAnalitica, type Subcategoria, type Preset } from './utils'

export function TabGastos({
  movimientos,
  subcategorias,
  hasProAccess,
}: {
  movimientos:   MovAnalitica[]
  subcategorias: Subcategoria[]
  hasProAccess:  boolean
}) {
  const [preset, setPreset] = useState<Preset>('6M')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')

  const { desde, hasta } = useMemo(() => {
    if (preset === 'custom' && customDesde && customHasta) {
      return {
        desde: new Date(customDesde + 'T00:00:00'),
        hasta: new Date(customHasta + 'T23:59:59'),
      }
    }
    if (preset === 'custom') return getDateRange('6M')
    return getDateRange(preset)
  }, [preset, customDesde, customHasta])

  const movsFiltrados = useMemo(() =>
    movimientos.filter(m => {
      const f = parseFecha(m.fecha)
      return f >= desde && f <= hasta
    }),
    [movimientos, desde, hasta]
  )

  return (
    <div className="space-y-6">
      <PeriodSelector
        preset={preset}
        customDesde={customDesde}
        customHasta={customHasta}
        onPresetChange={setPreset}
        onCustomDesdeChange={setCustomDesde}
        onCustomHastaChange={setCustomHasta}
      />

      <PanelCategorias
        movs={movsFiltrados}
        movsTodos={movimientos}
        desde={desde}
        hasta={hasta}
        subcategorias={subcategorias}
      />

      <PanelTopGastos movs={movsFiltrados} />

      <AIDeepReport
        movimientos={movimientos}
        movsPeriodo={movsFiltrados}
        desde={desde}
        hasta={hasta}
        hasProAccess={hasProAccess}
      />
    </div>
  )
}
