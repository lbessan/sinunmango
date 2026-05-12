// ─── Computación de insights para la tab Resumen ─────────────────────────────
//
// Recibe el universo de movimientos + un rango de fechas y devuelve métricas
// "interesantes" — más allá de los agregados básicos. La idea es que cada
// insight tenga una historia: un valor, una comparativa, opcionalmente un
// timeline.

import { montoOf, parseFecha, diasEntre, pctDelta, type MovAnalitica } from './utils'

export type InsightsResult = {
  // ── Hero ──
  neto:           number
  totalIngresos:  number
  totalGastos:    number
  diasPeriodo:    number
  savingsRate:    number       // % del income que ahorraste

  // ── Comparativas vs período inmediato anterior del mismo tamaño ──
  netoAnterior:   number
  totalGastosAnterior: number
  totalIngresosAnterior: number
  netoDeltaPct:   number | null
  gastosDeltaPct: number | null

  // ── Promedio diario ──
  gastoPromedioDiario: number
  // Spark = gastos diarios de los últimos 30 días del período (o menos si el período es chico)
  gastosDiariosUltimos30: number[]

  // ── Día más caro ──
  diaMasCaro:     { fecha: string; total: number; topDetalle: string | null } | null

  // ── Racha sin gastos ──
  rachaSinGastos: { dias: number; desde: string; hasta: string } | null

  // ── Categoría que más creció ──
  catTopCrecimiento: {
    nombre: string
    icono:  string | null
    actual: number
    anterior: number
    deltaPct: number
  } | null

  // ── Run-rate del mes en curso (si el período incluye el mes actual) ──
  runRateMes: {
    gastadoMTD:     number   // gasto del mes hasta hoy
    proyectado:     number   // proyección fin de mes
    diasTranscurridos: number
    diasDelMes:     number
  } | null

  // ── Movimientos / categorías totales ──
  movimientosCount: number
  categoriasCount:  number
  diasConGastos:    number   // días distintos con al menos un gasto
}

export function computeInsights(
  movs: MovAnalitica[],
  desde: Date,
  hasta: Date,
): InsightsResult {
  // ── Filtrar al período ──
  const inRange = movs.filter(m => {
    const f = parseFecha(m.fecha)
    return f >= desde && f <= hasta
  })

  const ingresos = inRange.filter(m => m.tipo_movimiento === 'Ingreso')
  const gastos   = inRange.filter(m => m.tipo_movimiento === 'Gasto')

  const totalIngresos = ingresos.reduce((a, m) => a + montoOf(m), 0)
  const totalGastos   = gastos.reduce((a, m) => a + montoOf(m), 0)
  const neto          = totalIngresos - totalGastos
  const diasPeriodo   = diasEntre(desde, hasta)
  const savingsRate   = totalIngresos > 0 ? (neto / totalIngresos) * 100 : 0

  // ── Período anterior del mismo tamaño ──
  const periodoDuracion = hasta.getTime() - desde.getTime()
  const antHasta = new Date(desde.getTime() - 86_400_000)         // un día antes de "desde"
  const antDesde = new Date(antHasta.getTime() - periodoDuracion)
  const anteriores = movs.filter(m => {
    const f = parseFecha(m.fecha)
    return f >= antDesde && f <= antHasta
  })
  const ingresosAnt = anteriores.filter(m => m.tipo_movimiento === 'Ingreso')
  const gastosAnt   = anteriores.filter(m => m.tipo_movimiento === 'Gasto')
  const totalIngresosAnterior = ingresosAnt.reduce((a, m) => a + montoOf(m), 0)
  const totalGastosAnterior   = gastosAnt.reduce((a, m) => a + montoOf(m), 0)
  const netoAnterior          = totalIngresosAnterior - totalGastosAnterior
  const netoDeltaPct          = pctDelta(neto, netoAnterior)
  const gastosDeltaPct        = pctDelta(totalGastos, totalGastosAnterior)

  // ── Promedio diario y series ──
  const gastoPromedioDiario = totalGastos / diasPeriodo

  // Spark últimos 30 días del período
  const sparkDesde = new Date(hasta.getTime() - 29 * 86_400_000)
  const sparkInicio = sparkDesde > desde ? sparkDesde : desde
  const sparkDias = diasEntre(sparkInicio, hasta)
  const gastosPorDia: Record<string, number> = {}
  gastos.forEach(m => {
    const f = parseFecha(m.fecha)
    if (f >= sparkInicio && f <= hasta) {
      gastosPorDia[m.fecha] = (gastosPorDia[m.fecha] ?? 0) + montoOf(m)
    }
  })
  const gastosDiariosUltimos30: number[] = []
  for (let i = 0; i < sparkDias; i++) {
    const d = new Date(sparkInicio.getTime() + i * 86_400_000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    gastosDiariosUltimos30.push(gastosPorDia[key] ?? 0)
  }

  // ── Día más caro ──
  const totalPorDia: Record<string, { total: number; mov: MovAnalitica | null }> = {}
  gastos.forEach(m => {
    if (!totalPorDia[m.fecha]) totalPorDia[m.fecha] = { total: 0, mov: null }
    totalPorDia[m.fecha].total += montoOf(m)
    if (!totalPorDia[m.fecha].mov || montoOf(m) > montoOf(totalPorDia[m.fecha].mov!)) {
      totalPorDia[m.fecha].mov = m
    }
  })
  const diaMasCaroEntry = Object.entries(totalPorDia).sort((a, b) => b[1].total - a[1].total)[0]
  const diaMasCaro = diaMasCaroEntry
    ? { fecha: diaMasCaroEntry[0], total: diaMasCaroEntry[1].total, topDetalle: diaMasCaroEntry[1].mov?.detalle ?? null }
    : null

  // ── Racha sin gastos (días consecutivos sin gasto) ──
  // Construir set de fechas con gasto, recorrer cada día del período y encontrar la racha más larga.
  const diasConGasto = new Set(gastos.map(g => g.fecha))
  let mejorRacha:    { dias: number; desde: string; hasta: string } | null = null
  let rachaActual = 0
  let rachaInicio: Date | null = null
  for (let i = 0; i < diasPeriodo; i++) {
    const d = new Date(desde.getTime() + i * 86_400_000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!diasConGasto.has(key)) {
      if (rachaActual === 0) rachaInicio = d
      rachaActual++
      if (!mejorRacha || rachaActual > mejorRacha.dias) {
        mejorRacha = {
          dias:  rachaActual,
          desde: `${rachaInicio!.getFullYear()}-${String(rachaInicio!.getMonth() + 1).padStart(2, '0')}-${String(rachaInicio!.getDate()).padStart(2, '0')}`,
          hasta: key,
        }
      }
    } else {
      rachaActual = 0
      rachaInicio = null
    }
  }
  // Solo reportamos rachas significativas (>= 2 días, sino es ruido)
  const rachaSinGastos = mejorRacha && mejorRacha.dias >= 2 ? mejorRacha : null

  // ── Categoría que más creció vs período anterior ──
  const catActual: Record<string, { total: number; icono: string | null }> = {}
  gastos.forEach(m => {
    const k = m.categoria_nombre ?? 'Sin categoría'
    if (!catActual[k]) catActual[k] = { total: 0, icono: m.categoria_icono }
    catActual[k].total += montoOf(m)
  })
  const catAnt: Record<string, number> = {}
  gastosAnt.forEach(m => {
    const k = m.categoria_nombre ?? 'Sin categoría'
    catAnt[k] = (catAnt[k] ?? 0) + montoOf(m)
  })
  // Solo considerar categorías con presencia en ambos períodos (y mínimo razonable)
  let topCrecimiento: InsightsResult['catTopCrecimiento'] = null
  for (const [nombre, { total: actual, icono }] of Object.entries(catActual)) {
    const anterior = catAnt[nombre] ?? 0
    if (anterior < 100) continue   // descartar categorías con base muy baja (% engañoso)
    const delta = pctDelta(actual, anterior)
    if (delta === null || delta <= 0) continue
    if (!topCrecimiento || delta > topCrecimiento.deltaPct) {
      topCrecimiento = { nombre, icono, actual, anterior, deltaPct: delta }
    }
  }

  // ── Run-rate del mes en curso ──
  // Si "hoy" cae dentro del rango, proyectamos el gasto del mes actual a fin de mes.
  const hoy = new Date()
  const mesActualStart = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const mesActualEnd   = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  let runRateMes: InsightsResult['runRateMes'] = null
  if (hoy >= desde && hoy <= hasta) {
    const gastadoMTD = gastos
      .filter(m => {
        const f = parseFecha(m.fecha)
        return f >= mesActualStart && f <= hoy
      })
      .reduce((a, m) => a + montoOf(m), 0)
    const diasTranscurridos = hoy.getDate()
    const diasDelMes        = mesActualEnd.getDate()
    const proyectado        = (gastadoMTD / diasTranscurridos) * diasDelMes
    runRateMes = { gastadoMTD, proyectado, diasTranscurridos, diasDelMes }
  }

  // ── Conteos ──
  const categoriasSet = new Set(gastos.map(g => g.categoria_nombre ?? 'Sin categoría'))

  return {
    neto,
    totalIngresos,
    totalGastos,
    diasPeriodo,
    savingsRate,
    netoAnterior,
    totalGastosAnterior,
    totalIngresosAnterior,
    netoDeltaPct,
    gastosDeltaPct,
    gastoPromedioDiario,
    gastosDiariosUltimos30,
    diaMasCaro,
    rachaSinGastos,
    catTopCrecimiento: topCrecimiento,
    runRateMes,
    movimientosCount: inRange.length,
    categoriasCount:  categoriasSet.size,
    diasConGastos:    diasConGasto.size,
  }
}
