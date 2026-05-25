// ─── lib/proyecciones.ts ─────────────────────────────────────────────────────
//
// Funciones puras (sin side effects, sin Supabase) para el cálculo de
// proyecciones financieras del dashboard.
//
// Antes esta lógica vivía inline en app/(app)/dashboard/page.tsx — la
// extraemos a este módulo para poder testearla aisladamente (toda la
// app de finanzas depende de que esto sume bien). El dashboard sigue
// haciendo el fetching async; la matemática se importa de acá.
//
// Convención: todos los inputs en sus monedas nativas (ARS/USD) — internamente
// convertimos a ARS usando la cotización del BNA. Outputs siempre en ARS.

// ── Tipos de input ────────────────────────────────────────────────────────

/** Lo que devuelve la vista dashboard_resumen — solo los campos que usamos. */
export type ResumenInput = {
  disponible_real?:           number | null
  ingresos_futuros_mes?:      number | null
  gastos_fijos_pendientes?:   number | null
  deuda_tarjetas_periodo?:    number | null
  pagos_tarjeta_mes?:         number | null
}

/** Movimiento minimal — solo campos relevantes para sumar. */
export type MontoMoneda = {
  monto:   number
  moneda:  string | null
}

/** Movimiento de gasto de TC — incluye cuenta_origen para filtrar. */
export type GastoTcInput = MontoMoneda & {
  cuenta_origen: string | null
}

/** Gasto fijo configurado — usamos monto_estimado + el tipo de cuenta. */
export type GastoFijoInput = {
  monto_estimado: number
  moneda:         string | null
  cuentas?:       { tipo_cuenta?: string | null } | null
}

/** Output del cálculo de un mes de proyección (los que devolvemos al UI). */
export type ProyeccionMes = {
  periodo:        string
  label:          string
  ingresos:       number
  gastos_fijos:   number
  gastos_tarjeta: number
  proyeccion:     number
  diferencia:     number
}

// ── Helpers de monto ──────────────────────────────────────────────────────

/**
 * Suma una lista de items en distintas monedas convirtiendo USD→ARS.
 * Si `moneda === 'USD'`, multiplica por `dolar`. Otherwise (ARS, null, etc.),
 * usa el monto tal cual.
 */
export function sumarMontoARS(items: ReadonlyArray<MontoMoneda>, dolar: number): number {
  return items.reduce((a, m) => a + (m.moneda === 'USD' ? m.monto * dolar : m.monto), 0)
}

/**
 * Versión específica para gastos fijos (campo monto_estimado en vez de monto).
 */
export function sumarGastosFijosARS(items: ReadonlyArray<GastoFijoInput>, dolar: number): number {
  return items.reduce(
    (a, g) => a + (g.moneda === 'USD' ? g.monto_estimado * dolar : g.monto_estimado),
    0,
  )
}

// ── Saldo inicial / startSaldo ────────────────────────────────────────────

/**
 * Calcula el saldo "startSaldo" que se usa como punto de partida para las
 * proyecciones futuras. Fórmula:
 *
 *   startSaldo = disponible_real
 *              + ingresos_futuros_mes
 *              - gastos_fijos_pendientes
 *              - max(0, deuda_tarjetas_periodo - pagos_tarjeta_mes)
 *
 * El "deudaRest" se clampa a 0 porque si ya pagaste más que la deuda del
 * período (cosa rara pero posible), no queremos restarla negativa al saldo.
 */
export function calcularSaldoInicial(resumen: ResumenInput | null | undefined): number {
  if (!resumen) return 0
  const deudaRest = Math.max(
    0,
    (resumen.deuda_tarjetas_periodo ?? 0) - (resumen.pagos_tarjeta_mes ?? 0),
  )
  return (resumen.disponible_real ?? 0)
    + (resumen.ingresos_futuros_mes ?? 0)
    - (resumen.gastos_fijos_pendientes ?? 0)
    - deudaRest
}

// ── Gastos fijos bifurcados (efectivo vs tarjeta) ─────────────────────────

/**
 * Separa los gastos fijos según si se pagan con efectivo/banco/billetera
 * o con tarjeta de crédito. Devuelve ambos totales en ARS.
 *
 * La diferenciación es importante porque la tarjeta no afecta el saldo
 * disponible hasta que se paga el resumen — el modelo de proyección las
 * trata distinto.
 */
export function bifurcarGastosFijos(
  gastosFijos: ReadonlyArray<GastoFijoInput>,
  dolar: number,
): { efectivo: number; tarjeta: number } {
  const efectivo = sumarGastosFijosARS(
    gastosFijos.filter(g => g.cuentas?.tipo_cuenta !== 'Tarjeta Credito'),
    dolar,
  )
  const tarjeta = sumarGastosFijosARS(
    gastosFijos.filter(g => g.cuentas?.tipo_cuenta === 'Tarjeta Credito'),
    dolar,
  )
  return { efectivo, tarjeta }
}

// ── Total gastos de TC del mes (filtrando por IDs de tarjetas) ────────────

/**
 * Suma los gastos de tarjeta de crédito a partir de un array de movimientos
 * de tipo Gasto. Filtra los que tienen `cuenta_origen` que pertenece al
 * set de IDs de tarjetas del user.
 */
export function calcularTotalTCMes(
  gastosMes: ReadonlyArray<GastoTcInput>,
  tarjetaIds: ReadonlySet<string>,
  dolar: number,
): number {
  return sumarMontoARS(
    gastosMes.filter(m => m.cuenta_origen != null && tarjetaIds.has(m.cuenta_origen)),
    dolar,
  )
}

// ── Cálculo iterativo de proyecciones ─────────────────────────────────────

/**
 * Datos por mes que el orquestador pre-fetchea de Supabase. Cada slot
 * corresponde a un mes futuro (i=1, 2, 3, ... totalLoop), todos en
 * `periodo_tarjeta` format YYYY-MM-01.
 */
export type MesData = {
  periodo:      string          // YYYY-MM-01
  totalIngresos: number          // suma en ARS
  totalTC:       number          // suma en ARS
}

/**
 * Itera mes a mes acumulando el saldo:
 *
 *   saldo_t = saldo_{t-1} + ingresos_t - gastosFijosEfectivo - gastosFijosTarjeta - gastosTC_t
 *
 * Los primeros `skipCount` meses NO se devuelven (corresponden al mes actual
 * + previos al "desde" — el user no los ve, pero se computan para que el
 * saldo arrastrado sea correcto).
 *
 * Devuelve también `saldoBase` (saldo al final del skipCount-ésimo mes, que
 * es el "punto de partida" del primer mes mostrado) y `saldoInicioMes`
 * (saldo justo ANTES de procesar ese mes).
 */
export function calcularProyeccionesIterativo(opts: {
  startSaldo:          number
  gastosFijosEfectivo: number
  gastosFijosTarjeta:  number
  meses:               ReadonlyArray<MesData>  // length = totalLoop
  skipCount:           number
}): {
  saldoBase:      number
  saldoInicioMes: number
  proyecciones:   ProyeccionMes[]
  datosDelMes:    { totalIng: number; totalTC: number }
} {
  let saldo          = Math.round(opts.startSaldo)
  let saldoBase      = saldo
  let saldoInicioMes = Math.round(opts.startSaldo)
  let datosDelMes    = { totalIng: 0, totalTC: 0 }
  const proyecciones: ProyeccionMes[] = []

  // Tomamos length de meses como totalLoop (debería = skipCount + Nmeses)
  for (let i = 1; i <= opts.meses.length; i++) {
    const idx = i - 1
    const m   = opts.meses[idx]

    // Capturar saldo ANTES de procesar el mes mostrado
    if (i === opts.skipCount) saldoInicioMes = saldo

    saldo = Math.round(
      saldo + m.totalIngresos
        - opts.gastosFijosEfectivo
        - opts.gastosFijosTarjeta
        - m.totalTC
    )

    if (i === opts.skipCount) {
      saldoBase = saldo
      datosDelMes = {
        totalIng: Math.round(m.totalIngresos),
        totalTC:  Math.round(m.totalTC),
      }
    }

    if (i > opts.skipCount) {
      const [y, mo] = m.periodo.split('-').map(Number)
      const label = new Date(y, mo - 1, 1)
        .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
        .replace(' de ', ' ')
        .replace(/^\w/, c => c.toUpperCase())

      const prev = i === opts.skipCount + 1
        ? saldoBase
        : proyecciones[proyecciones.length - 1].proyeccion

      proyecciones.push({
        periodo:        m.periodo,
        label,
        ingresos:       Math.round(m.totalIngresos),
        gastos_fijos:   Math.round(opts.gastosFijosEfectivo),
        gastos_tarjeta: Math.round(m.totalTC),
        proyeccion:     saldo,
        diferencia:     saldo - prev,
      })
    }
  }

  return { saldoBase, saldoInicioMes, proyecciones, datosDelMes }
}

// ── skipCount helper ──────────────────────────────────────────────────────

/**
 * Cuántos meses iterar antes del primer mes "mostrado". Si el current
 * (cy/cm) es 2026-05 y el desde es 2026-07, devuelve 2 (el loop arranca
 * en i=1 = junio, i=2 = julio = primer mostrado).
 */
export function calcularSkipCount(opts: {
  currentYear:  number
  currentMonth: number   // 1-12
  desdeYear:    number
  desdeMonth:   number   // 1-12
}): number {
  return (opts.desdeYear - opts.currentYear) * 12 + (opts.desdeMonth - opts.currentMonth)
}
