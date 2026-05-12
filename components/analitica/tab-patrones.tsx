'use client'

// ─── Tab Patrones ────────────────────────────────────────────────────────────
//
// Comportamiento financiero — no qué gastaste sino CÓMO gastás:
//   1. Period selector
//   2. Anomalías (gastos fuera del promedio)
//   3. Recurrentes (suscripciones detectadas)
//   4. Heatmap temporal (día semana / día mes)
//   5. Tu semana tipo (cat top por día de semana)
//   6. Primera vs segunda quincena

import { useState, useMemo } from 'react'
import { PeriodSelector }   from './period-selector'
import { PanelAnomalias }   from './panel-anomalias'
import { PanelRecurrentes } from './panel-recurrentes'
import { PanelVariacion }   from './panel-variacion'
import { HeatmapTemporal }  from './heatmap-temporal'
import { PanelSemanaTipo }  from './panel-semana-tipo'
import { PanelQuincenas }   from './panel-quincenas'
import { getDateRange, parseFecha, type MovAnalitica, type Preset } from './utils'

export function TabPatrones({ movimientos }: { movimientos: MovAnalitica[] }) {
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

      {/* Anomalías y recurrentes usan TODO el histórico, no el período */}
      <PanelAnomalias   movs={movimientos} />
      <PanelRecurrentes movs={movimientos} />

      {/* Variación mes a mes — patrón de cambio */}
      <PanelVariacion movsTodos={movimientos} />

      {/* Patrones temporales del período */}
      <HeatmapTemporal movs={movsFiltrados} />
      <PanelSemanaTipo movs={movsFiltrados} />
      <PanelQuincenas  movs={movsFiltrados} />
    </div>
  )
}
