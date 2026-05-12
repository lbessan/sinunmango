// ─── Construcción del contexto textual para el AI ────────────────────────────
//
// Toma los insights y datos brutos del período y los formatea como texto plano
// listo para mandar a Claude. Mantiene un formato consistente para que el LLM
// pueda razonar sobre los datos sin tener que adivinar la estructura.

import { fmt, montoOf, parseFecha, type MovAnalitica } from './utils'
import type { InsightsResult } from './insights'

function fmtFechaCorta(iso: string): string {
  return parseFecha(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function buildContextoNarrativa(
  insights:  InsightsResult,
  movsPeriodo: MovAnalitica[],
  desde:     Date,
  hasta:     Date,
): string {
  const gastos = movsPeriodo.filter(m => m.tipo_movimiento === 'Gasto')

  // Top categorías
  const catMap: Record<string, number> = {}
  gastos.forEach(m => {
    const k = m.categoria_nombre ?? 'Sin categoría'
    catMap[k] = (catMap[k] ?? 0) + montoOf(m)
  })
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const totalGastos = Object.values(catMap).reduce((a, v) => a + v, 0)

  const lines: string[] = []
  lines.push(`Período analizado: ${fmtFechaCorta(desde.toISOString().slice(0, 10))} → ${fmtFechaCorta(hasta.toISOString().slice(0, 10))} (${insights.diasPeriodo} días)`)
  lines.push('')
  lines.push('RESULTADO FINANCIERO:')
  lines.push(`- Ingresos: $${fmt(insights.totalIngresos)}`)
  lines.push(`- Gastos: $${fmt(insights.totalGastos)}`)
  lines.push(`- Neto: ${insights.neto >= 0 ? '+' : ''}$${fmt(insights.neto)} (tasa de ahorro ${Math.round(insights.savingsRate)}%)`)
  lines.push('')
  lines.push('COMPARATIVA VS PERÍODO ANTERIOR DEL MISMO TAMAÑO:')
  lines.push(`- Ingresos anterior: $${fmt(insights.totalIngresosAnterior)} (${insights.totalIngresosAnterior > 0 && insights.totalIngresos > 0 ? `${insights.totalIngresos > insights.totalIngresosAnterior ? '+' : ''}${Math.round(((insights.totalIngresos - insights.totalIngresosAnterior) / insights.totalIngresosAnterior) * 100)}%` : 'sin comparable'})`)
  lines.push(`- Gastos anterior: $${fmt(insights.totalGastosAnterior)} (${insights.gastosDeltaPct !== null ? `${insights.gastosDeltaPct >= 0 ? '+' : ''}${Math.round(insights.gastosDeltaPct)}%` : 'sin comparable'})`)
  lines.push(`- Neto anterior: ${insights.netoAnterior >= 0 ? '+' : ''}$${fmt(insights.netoAnterior)} (${insights.netoDeltaPct !== null ? `${insights.netoDeltaPct >= 0 ? '+' : ''}${Math.round(insights.netoDeltaPct)}%` : 'sin comparable'})`)
  lines.push('')
  lines.push('TOP 5 CATEGORÍAS DE GASTO:')
  topCats.forEach(([nombre, monto], i) => {
    const pct = totalGastos > 0 ? (monto / totalGastos) * 100 : 0
    lines.push(`${i + 1}. ${nombre}: $${fmt(monto)} (${pct.toFixed(1)}%)`)
  })
  lines.push('')

  if (insights.catTopCrecimiento) {
    lines.push(`CATEGORÍA QUE MÁS CRECIÓ: ${insights.catTopCrecimiento.nombre} +${Math.round(insights.catTopCrecimiento.deltaPct)}% — de $${fmt(insights.catTopCrecimiento.anterior)} a $${fmt(insights.catTopCrecimiento.actual)}`)
  } else {
    lines.push('CATEGORÍA QUE MÁS CRECIÓ: sin datos suficientes para comparar')
  }
  lines.push('')

  if (insights.diaMasCaro) {
    lines.push(`DÍA MÁS CARO: ${fmtFechaCorta(insights.diaMasCaro.fecha)} — $${fmt(insights.diaMasCaro.total)}${insights.diaMasCaro.topDetalle ? ` (top gasto: ${insights.diaMasCaro.topDetalle})` : ''}`)
  }

  if (insights.rachaSinGastos) {
    lines.push(`RACHA SIN GASTOS MÁS LARGA: ${insights.rachaSinGastos.dias} días (del ${fmtFechaCorta(insights.rachaSinGastos.desde)} al ${fmtFechaCorta(insights.rachaSinGastos.hasta)})`)
  }

  lines.push('')
  lines.push(`GASTO PROMEDIO DIARIO: $${fmt(Math.round(insights.gastoPromedioDiario))}`)
  lines.push(`DÍAS CON GASTOS: ${insights.diasConGastos} de ${insights.diasPeriodo}`)
  lines.push(`MOVIMIENTOS TOTALES: ${insights.movimientosCount}`)
  lines.push(`CATEGORÍAS USADAS: ${insights.categoriasCount}`)

  if (insights.runRateMes) {
    lines.push('')
    lines.push(`MES EN CURSO (estimación):`)
    lines.push(`- Gastado a la fecha: $${fmt(Math.round(insights.runRateMes.gastadoMTD))} en ${insights.runRateMes.diasTranscurridos}/${insights.runRateMes.diasDelMes} días`)
    lines.push(`- Proyección fin de mes: $${fmt(Math.round(insights.runRateMes.proyectado))}`)
  }

  return lines.join('\n')
}

export function buildContextoProfundo(
  insights:  InsightsResult,
  movsPeriodo: MovAnalitica[],
  desde:     Date,
  hasta:     Date,
  movsTodos: MovAnalitica[],
): string {
  // Para análisis profundo agregamos: evolución mensual, recurrentes, anomalías,
  // distribución por día de semana, top 10 categorías con delta.
  const base = buildContextoNarrativa(insights, movsPeriodo, desde, hasta)
  const lines: string[] = [base, '']

  // Evolución mensual
  const gastosPeriodo = movsPeriodo.filter(m => m.tipo_movimiento === 'Gasto')
  const ingresosPeriodo = movsPeriodo.filter(m => m.tipo_movimiento === 'Ingreso')
  const porMes: Record<string, { ingresos: number; gastos: number }> = {}
  ;[...gastosPeriodo, ...ingresosPeriodo].forEach(m => {
    const k = m.fecha.slice(0, 7)
    if (!porMes[k]) porMes[k] = { ingresos: 0, gastos: 0 }
    if (m.tipo_movimiento === 'Ingreso') porMes[k].ingresos += montoOf(m)
    else                                  porMes[k].gastos   += montoOf(m)
  })
  lines.push('EVOLUCIÓN MENSUAL:')
  Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).forEach(([mes, v]) => {
    const neto = v.ingresos - v.gastos
    lines.push(`- ${mes}: ingresos $${fmt(Math.round(v.ingresos))} | gastos $${fmt(Math.round(v.gastos))} | neto ${neto >= 0 ? '+' : ''}$${fmt(Math.round(neto))}`)
  })
  lines.push('')

  // Día de semana
  const dows = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const totalDow: number[] = [0, 0, 0, 0, 0, 0, 0]
  gastosPeriodo.forEach(m => {
    totalDow[parseFecha(m.fecha).getDay()] += montoOf(m)
  })
  lines.push('GASTO TOTAL POR DÍA DE SEMANA:')
  dows.forEach((label, i) => {
    lines.push(`- ${label}: $${fmt(Math.round(totalDow[i]))}`)
  })
  lines.push('')

  // Top 10 categorías con delta (período anterior comparable)
  const duracion = hasta.getTime() - desde.getTime()
  const antHasta = new Date(desde.getTime() - 86_400_000)
  const antDesde = new Date(antHasta.getTime() - duracion)
  const catActual: Record<string, number> = {}
  gastosPeriodo.forEach(m => {
    const k = m.categoria_nombre ?? 'Sin categoría'
    catActual[k] = (catActual[k] ?? 0) + montoOf(m)
  })
  const catAnterior: Record<string, number> = {}
  movsTodos
    .filter(m => m.tipo_movimiento === 'Gasto')
    .filter(m => {
      const f = parseFecha(m.fecha)
      return f >= antDesde && f <= antHasta
    })
    .forEach(m => {
      const k = m.categoria_nombre ?? 'Sin categoría'
      catAnterior[k] = (catAnterior[k] ?? 0) + montoOf(m)
    })

  const top10 = Object.entries(catActual).sort((a, b) => b[1] - a[1]).slice(0, 10)
  lines.push('TOP 10 CATEGORÍAS CON COMPARATIVA:')
  top10.forEach(([cat, monto], i) => {
    const ant = catAnterior[cat] ?? 0
    const delta = ant > 0 ? ((monto - ant) / ant) * 100 : null
    lines.push(`${i + 1}. ${cat}: $${fmt(Math.round(monto))} (anterior: $${fmt(Math.round(ant))} · ${delta !== null ? `${delta >= 0 ? '+' : ''}${Math.round(delta)}%` : 'nuevo'})`)
  })

  return lines.join('\n')
}
