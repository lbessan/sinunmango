// ─── Detección de gastos recurrentes ─────────────────────────────────────────
//
// Heurística: un movimiento es "recurrente" si:
//   1. El mismo detalle (normalizado) aparece en ≥3 meses distintos
//   2. Los montos son similares (coeficiente de variación < 30%)
//   3. La frecuencia es estable (cobertura ≥ 60% de los meses entre el primer
//      y último avistamiento)
//
// Caso de uso: suscripciones, alquileres, planes mensuales, gastos fijos no
// cargados como `gastos_fijos`.

import { montoOf, parseFecha, type MovAnalitica } from './utils'

export type RecurrenteItem = {
  detalle:             string         // detalle "limpio" (normalizado, sin "(Cuota X)")
  detalleOriginal:     string         // detalle tal como aparece (último visto)
  categoria:           string | null
  categoriaIcono:      string | null
  montoPromedio:       number
  montoMin:            number
  montoMax:            number
  ocurrencias:         number
  mesesActivos:        number         // cantidad de meses distintos donde apareció
  cobertura:           number         // % de meses cubiertos entre el primer y último
  frecuencia:          'mensual' | 'irregular'
  primerVisto:         string
  ultimoVisto:         string
  totalAnualEstimado:  number | null  // sólo si es mensual
  pegajosidad:         number         // score 0-100 de cuán "pegajoso" es
}

const STOP_WORDS = ['cuota', 'el día', 'a las', 'autorización', 'consumo']

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  let v = s.toLowerCase().trim()
  // Sacar sufijos de cuotas: "compra (cuota 5/12)" → "compra"
  v = v.replace(/\s*\(cuota\s+\d+(?:\/\d+)?\)\s*/gi, ' ')
  // Colapsar espacios
  v = v.replace(/\s+/g, ' ').trim()
  // Sacar trailing punctuation
  v = v.replace(/[.,;!?]+$/, '').trim()
  return v
}

function statsDeMontos(montos: number[]) {
  const sum  = montos.reduce((a, b) => a + b, 0)
  const mean = sum / montos.length
  const variance = montos.reduce((a, b) => a + (b - mean) ** 2, 0) / montos.length
  const stddev = Math.sqrt(variance)
  return {
    mean,
    stddev,
    min: Math.min(...montos),
    max: Math.max(...montos),
    coefVar: mean > 0 ? stddev / mean : Infinity,
  }
}

function totalMesesEntre(desde: Date, hasta: Date): number {
  return Math.max(1,
    (hasta.getFullYear() - desde.getFullYear()) * 12 +
    (hasta.getMonth() - desde.getMonth()) + 1
  )
}

export function detectarRecurrentes(movs: MovAnalitica[]): RecurrenteItem[] {
  // Sólo gastos. Agrupar por (detalle normalizado, categoría).
  const groups: Record<string, MovAnalitica[]> = {}

  for (const m of movs) {
    if (m.tipo_movimiento !== 'Gasto') continue
    // Compras en cuotas NO son recurrentes — son la misma compra fraccionada
    // en N cuotas. La heurística las confundiría porque tienen el mismo detalle
    // y monto en meses consecutivos.
    if ((m.cuotas_total ?? 1) > 1) continue
    const det = normalize(m.detalle)
    if (!det || det.length < 3) continue
    // Filtro de stop-words sueltos (palabras muy genéricas no son detalle)
    if (STOP_WORDS.some(w => det === w)) continue

    const cat = m.categoria_nombre ?? '__none__'
    const key = `${det}|${cat}`
    if (!groups[key]) groups[key] = []
    groups[key].push(m)
  }

  const results: RecurrenteItem[] = []

  for (const [key, movsGroup] of Object.entries(groups)) {
    if (movsGroup.length < 3) continue

    // Meses distintos
    const meses = new Set(movsGroup.map(m => m.fecha.slice(0, 7)))
    if (meses.size < 3) continue

    // Stats de monto
    const montos = movsGroup.map(montoOf)
    const stats  = statsDeMontos(montos)

    // Tolerancia más alta si el monto es chico (ruido absoluto importa menos)
    const coefVarMax = stats.mean < 1_000 ? 0.5 : 0.3
    if (stats.coefVar > coefVarMax) continue

    // Cobertura
    const sorted     = [...movsGroup].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const primer     = sorted[0]
    const ultimo     = sorted[sorted.length - 1]
    const totalMeses = totalMesesEntre(parseFecha(primer.fecha), parseFecha(ultimo.fecha))
    const cobertura  = meses.size / totalMeses

    // Frecuencia "mensual" sólo si cobertura ≥ 60%
    const frecuencia: RecurrenteItem['frecuencia'] = cobertura >= 0.6 ? 'mensual' : 'irregular'

    // Pegajosidad (score 0-100)
    // - 50 pts: cobertura
    // - 30 pts: estabilidad de monto (1 - coefVar)
    // - 20 pts: recencia (visto en los últimos 60 días → 20, decae lineal a 0 en 180 días)
    const today = new Date()
    const diasDesdeUltimo = Math.max(0, Math.floor((today.getTime() - parseFecha(ultimo.fecha).getTime()) / 86_400_000))
    const recenciaScore = Math.max(0, Math.min(20, 20 * (1 - (diasDesdeUltimo - 60) / 120)))
    const pegajosidad = Math.round(
      50 * cobertura +
      30 * (1 - Math.min(1, stats.coefVar)) +
      recenciaScore
    )

    results.push({
      detalle:            key.split('|')[0],
      detalleOriginal:    ultimo.detalle ?? key.split('|')[0],
      categoria:          movsGroup[0].categoria_nombre,
      categoriaIcono:     movsGroup[0].categoria_icono,
      montoPromedio:      stats.mean,
      montoMin:           stats.min,
      montoMax:           stats.max,
      ocurrencias:        movsGroup.length,
      mesesActivos:       meses.size,
      cobertura,
      frecuencia,
      primerVisto:        primer.fecha,
      ultimoVisto:        ultimo.fecha,
      totalAnualEstimado: frecuencia === 'mensual' ? stats.mean * 12 : null,
      pegajosidad,
    })
  }

  // Sort por total anual estimado (los mensuales arriba), o por monto promedio
  return results.sort((a, b) => {
    const aVal = a.totalAnualEstimado ?? a.montoPromedio * a.mesesActivos
    const bVal = b.totalAnualEstimado ?? b.montoPromedio * b.mesesActivos
    return bVal - aVal
  })
}
