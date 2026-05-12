// ─── Cálculos de proyecciones ────────────────────────────────────────────────

import { montoOf, parseFecha, type MovAnalitica } from './utils'

export type MesProyectado = {
  mes:      string   // YYYY-MM
  label:    string   // "Jun 26"
  ingreso:  number
  gasto:    number
  neto:     number
  isLoaded: boolean  // true si el mes tiene movimientos cargados (no es puro histórico)
}

export type ProyeccionMensual = {
  ingresoMensualProm:  number   // promedio mensual de los últimos N meses con data
  gastoMensualProm:    number
  netoMensualProm:     number
  mesesConsiderados:   number
}

/**
 * Calcula promedios mensuales basados en los últimos N meses completos
 * (excluye el mes en curso para no sesgar la proyección con un mes parcial).
 */
export function calcularPromediosMensuales(
  movs: MovAnalitica[],
  mesesAtras = 6,
): ProyeccionMensual {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras, 1)
  // Excluimos mes en curso
  const fin    = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  const porMes: Record<string, { ingresos: number; gastos: number }> = {}
  movs.forEach(m => {
    const f = parseFecha(m.fecha)
    if (f < inicio || f > fin) return
    const k = m.fecha.slice(0, 7)
    if (!porMes[k]) porMes[k] = { ingresos: 0, gastos: 0 }
    if (m.tipo_movimiento === 'Ingreso') porMes[k].ingresos += montoOf(m)
    else if (m.tipo_movimiento === 'Gasto') porMes[k].gastos += montoOf(m)
  })

  const arr = Object.values(porMes)
  if (arr.length === 0) {
    return { ingresoMensualProm: 0, gastoMensualProm: 0, netoMensualProm: 0, mesesConsiderados: 0 }
  }

  const sumIng = arr.reduce((a, v) => a + v.ingresos, 0)
  const sumGas = arr.reduce((a, v) => a + v.gastos, 0)
  return {
    ingresoMensualProm: sumIng / arr.length,
    gastoMensualProm:   sumGas / arr.length,
    netoMensualProm:    (sumIng - sumGas) / arr.length,
    mesesConsiderados:  arr.length,
  }
}

/**
 * Proyección híbrida a N meses hacia adelante: para cada mes usa lo que el
 * usuario ya tiene cargado SI es mayor que el promedio histórico, sino usa
 * el promedio. Así respeta ingresos/gastos futuros pre-cargados.
 *
 * Heurística:
 *   ingreso[mes] = max(loaded, historicoMensualProm)
 *   gasto[mes]   = max(loaded, historicoMensualProm)
 *
 * Razonamiento:
 *   - Si cargaste ingresos para el futuro (sueldo, bonus, freelance conocido),
 *     probablemente son mayores que el promedio → usamos los cargados.
 *   - Para gastos, lo cargado típicamente son sólo cuotas / gastos fijos que
 *     se proyectan automáticamente. El resto del gasto discrecional viene
 *     del promedio histórico. Usar max evita subestimar.
 */
export function calcularProyeccionHibrida(
  movs: MovAnalitica[],
  promedios: ProyeccionMensual,
  meses = 12,
): { total: number; byMonth: MesProyectado[] } {
  const hoy = new Date()
  const byMonth: MesProyectado[] = []
  let total = 0

  for (let i = 0; i < meses; i++) {
    const mY = hoy.getFullYear()
    const mM = hoy.getMonth() + i
    const mesStart = new Date(mY, mM, 1)
    const mesEnd   = new Date(mY, mM + 1, 0)
    const mesKey   = `${mesStart.getFullYear()}-${String(mesStart.getMonth() + 1).padStart(2, '0')}`

    const movsMes = movs.filter(m => {
      const f = parseFecha(m.fecha)
      return f >= mesStart && f <= mesEnd
    })

    const loadedIng = movsMes.filter(m => m.tipo_movimiento === 'Ingreso').reduce((a, m) => a + montoOf(m), 0)
    const loadedGas = movsMes.filter(m => m.tipo_movimiento === 'Gasto').reduce((a, m) => a + montoOf(m), 0)

    const ingreso = Math.max(loadedIng, promedios.ingresoMensualProm)
    const gasto   = Math.max(loadedGas, promedios.gastoMensualProm)
    const neto    = ingreso - gasto

    total += neto
    byMonth.push({
      mes:      mesKey,
      label:    mesStart.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
                  .replace('.', '').replace(/^\w/, c => c.toUpperCase()),
      ingreso,
      gasto,
      neto,
      isLoaded: loadedIng > 0 || loadedGas > 0,
    })
  }

  return { total, byMonth }
}

/**
 * Run-rate del mes en curso: cuánto vas a gastar fin de mes a este ritmo.
 */
export type RunRate = {
  gastadoMTD:        number
  ingresadoMTD:      number
  diasTranscurridos: number
  diasTotalesMes:    number
  proyectadoGasto:   number
  proyectadoIngreso: number
  proyectadoNeto:    number
}

export function calcularRunRate(movs: MovAnalitica[]): RunRate {
  const hoy = new Date()
  const mesStart   = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const mesEnd     = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  const diasTranscurridos = hoy.getDate()
  const diasTotalesMes    = mesEnd.getDate()

  const movsMes = movs.filter(m => {
    const f = parseFecha(m.fecha)
    return f >= mesStart && f <= hoy
  })

  const gastadoMTD   = movsMes.filter(m => m.tipo_movimiento === 'Gasto').reduce((a, m) => a + montoOf(m), 0)
  const ingresadoMTD = movsMes.filter(m => m.tipo_movimiento === 'Ingreso').reduce((a, m) => a + montoOf(m), 0)

  const factor = diasTotalesMes / diasTranscurridos
  return {
    gastadoMTD,
    ingresadoMTD,
    diasTranscurridos,
    diasTotalesMes,
    proyectadoGasto:   gastadoMTD * factor,
    proyectadoIngreso: ingresadoMTD * factor,
    proyectadoNeto:    (ingresadoMTD - gastadoMTD) * factor,
  }
}

/**
 * Proyección por categoría: promedio mensual histórico × meses.
 */
export type ProyeccionCategoria = {
  nombre:        string
  icono:         string | null
  mensualProm:   number
  proyAnual:     number
  ultimoMes:     number          // gasto del último mes cerrado
  delta:         number | null   // delta % último mes vs promedio
  mesesActivos:  number
}

export function calcularProyeccionesPorCategoria(
  movs: MovAnalitica[],
  mesesAtras = 6,
): ProyeccionCategoria[] {
  const hoy    = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras, 1)
  const fin    = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  const mesAnterior = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}`

  // Por categoría → por mes
  const porCat: Record<string, { icono: string | null; porMes: Record<string, number> }> = {}

  movs
    .filter(m => m.tipo_movimiento === 'Gasto')
    .forEach(m => {
      const f = parseFecha(m.fecha)
      if (f < inicio || f > fin) return
      const cat = m.categoria_nombre ?? 'Sin categoría'
      if (!porCat[cat]) porCat[cat] = { icono: m.categoria_icono, porMes: {} }
      const k = m.fecha.slice(0, 7)
      porCat[cat].porMes[k] = (porCat[cat].porMes[k] ?? 0) + montoOf(m)
    })

  return Object.entries(porCat).map(([nombre, { icono, porMes }]) => {
    const meses = Object.values(porMes)
    const sum = meses.reduce((a, v) => a + v, 0)
    const mensualProm = meses.length > 0 ? sum / meses.length : 0
    const ultimoMes   = porMes[mesAnterior] ?? 0
    const delta = mensualProm > 0 ? ((ultimoMes - mensualProm) / mensualProm) * 100 : null
    return {
      nombre,
      icono,
      mensualProm,
      proyAnual:    mensualProm * 12,
      ultimoMes,
      delta,
      mesesActivos: meses.length,
    }
  })
  .filter(c => c.mensualProm > 0)
  .sort((a, b) => b.proyAnual - a.proyAnual)
}
