// ─── Detección de anomalías por categoría ────────────────────────────────────
//
// Para cada categoría, comparamos el gasto del MES ACTUAL contra el promedio
// y desvío de los últimos N meses (excluyendo el actual). Si está fuera de
// rango, la marcamos como anomalía.
//
// Criterio "high":   actual > mean + 1.5 × stddev   AND  actual > mean × 1.3
// Criterio "severe": actual > mean + 2.5 × stddev   AND  actual > mean × 1.6
//
// Excluimos categorías con menos de 3 meses de historia (poca muestra).

import { montoOf, parseFecha, type MovAnalitica } from './utils'

export type AnomaliaItem = {
  categoria:      string
  icono:          string | null
  actual:         number
  promedio:       number
  stddev:         number
  deltaAbs:       number   // actual - promedio
  deltaPct:       number   // % delta sobre el promedio
  severidad:      'media' | 'alta'
  mesesHistoricos: number  // cuántos meses de historia tiene
  mejorComparable: number  // máximo histórico previo (para contexto)
}

function statsDeArray(arr: number[]) {
  if (arr.length === 0) return { mean: 0, stddev: 0 }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length
  return { mean, stddev: Math.sqrt(variance) }
}

export function detectarAnomalias(
  movs: MovAnalitica[],
  referencia: Date = new Date(),
): AnomaliaItem[] {
  // Mes referencia (= "actual")
  const mesRefStr = `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, '0')}`

  // Agrupar gastos por (categoría, mes)
  const byCatByMes: Record<string, Record<string, { total: number; icono: string | null }>> = {}
  for (const m of movs) {
    if (m.tipo_movimiento !== 'Gasto') continue
    const cat = m.categoria_nombre ?? 'Sin categoría'
    const mes = m.fecha.slice(0, 7)
    if (!byCatByMes[cat]) byCatByMes[cat] = {}
    if (!byCatByMes[cat][mes]) byCatByMes[cat][mes] = { total: 0, icono: m.categoria_icono }
    byCatByMes[cat][mes].total += montoOf(m)
  }

  const results: AnomaliaItem[] = []

  for (const [cat, porMes] of Object.entries(byCatByMes)) {
    const actual = porMes[mesRefStr]?.total ?? 0
    if (actual === 0) continue   // si no gastó este mes en esa categoría, no es anomalía

    // Histórico: todos los meses anteriores al de referencia
    const historicos = Object.entries(porMes)
      .filter(([mes]) => mes < mesRefStr)
      .map(([, v]) => v.total)

    if (historicos.length < 3) continue

    const { mean, stddev } = statsDeArray(historicos)
    if (mean === 0) continue

    const deltaAbs = actual - mean
    const deltaPct = (deltaAbs / mean) * 100

    // Anomalía "alta": > mean + 2.5σ y > 1.6 × mean
    // Anomalía "media": > mean + 1.5σ y > 1.3 × mean
    const esAlta  = actual > mean + 2.5 * stddev && actual > mean * 1.6
    const esMedia = actual > mean + 1.5 * stddev && actual > mean * 1.3

    if (!esAlta && !esMedia) continue

    results.push({
      categoria:       cat,
      icono:           porMes[mesRefStr]?.icono ?? null,
      actual,
      promedio:        mean,
      stddev,
      deltaAbs,
      deltaPct,
      severidad:       esAlta ? 'alta' : 'media',
      mesesHistoricos: historicos.length,
      mejorComparable: Math.max(...historicos),
    })
  }

  // Sort por delta absoluto descendente (las que más sobrepasan en $)
  return results.sort((a, b) => b.deltaAbs - a.deltaAbs)
}
