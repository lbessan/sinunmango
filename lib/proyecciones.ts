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
  gastos_fijos:   number   // gastos fijos PENDIENTES del mes (efectivo + tarjeta, sin los ya cargados como movimiento)
  gastos_tarjeta: number   // gastos de tarjeta del período, neto de reintegros
  gastos_otros:   number   // gastos por período en cuentas NO tarjeta (cuotas en banco, movs a futuro)
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
 * El clamp de "deudaRest": si ya pagaste más que la deuda del período, el
 * sobrepago no inventa plata (piso en la propia deuda). Pero si la deuda del
 * período es NEGATIVA (crédito neto: reintegros > gastos, posible desde que la
 * vista resta los Ingresos de tarjeta), ese crédito SÍ pasa — un piso fijo en
 * 0 lo descartaba y el mes actual quedaba subestimado vs los futuros.
 */
export function calcularSaldoInicial(resumen: ResumenInput | null | undefined): number {
  if (!resumen) return 0
  const deuda = resumen.deuda_tarjetas_periodo ?? 0
  const deudaRest = Math.max(
    Math.min(0, deuda),
    deuda - (resumen.pagos_tarjeta_mes ?? 0),
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

// ── Resumen mensual (movimientos + gastos fijos pendientes) ──────────────

/** Gasto fijo con id — para poder descontar los que ya tienen movimiento vinculado. */
export type GastoFijoConId = GastoFijoInput & { id: string }

/** Movimiento del mes tal como lo devuelve movimientos_completos. */
export type MovMesInput = {
  tipo_movimiento: string | null
  monto:           number
  monto_estimado:  number | null   // ya en ARS (respeta cotización si está conciliado)
  moneda:          string | null
  cuenta_origen:   string | null
  gasto_fijo_id:   string | null
}

/**
 * Datos de un mes de proyección, ya agregados:
 *   - totalIngresos: ingresos "cash" (excluye reintegros de tarjeta)
 *   - totalTC: gastos de tarjeta del período NETOS de reintegros
 *   - totalOtrosGastos: gastos por período en cuentas no-tarjeta (cuotas en
 *     banco, movimientos con fecha futura) — antes se perdían
 *   - gfEfectivoPendiente / gfTarjetaPendiente: gastos fijos del mes SIN
 *     movimiento vinculado (los vinculados ya están dentro de los totales de
 *     movimientos — restarlos de nuevo era el doble conteo)
 */
export type MesData = {
  periodo:             string  // YYYY-MM-01
  totalIngresos:       number
  totalTC:             number
  totalOtrosGastos:    number
  gfEfectivoPendiente: number
  gfTarjetaPendiente:  number
}

/** Monto en ARS de un movimiento de la vista: monto_estimado si vino, sino conversión manual. */
function montoARS(m: MovMesInput, dolar: number): number {
  if (m.monto_estimado != null) return m.monto_estimado
  return m.moneda === 'USD' ? m.monto * dolar : m.monto
}

/**
 * Agrega los movimientos de un período + los gastos fijos en el MesData que
 * consume el cálculo iterativo. Función pura — el fetching queda afuera.
 */
export function resumirMesProyeccion(opts: {
  periodo:     string
  movs:        ReadonlyArray<MovMesInput>
  gastosFijos: ReadonlyArray<GastoFijoConId>
  tarjetaIds:  ReadonlySet<string>
  dolar:       number
}): MesData {
  const esTarjeta = (m: MovMesInput) =>
    m.cuenta_origen != null && opts.tarjetaIds.has(m.cuenta_origen)

  let ingresosCash = 0, reintegrosTC = 0, gastosTC = 0, otrosGastos = 0
  const vinculados = new Set<string>()

  for (const m of opts.movs) {
    if (m.gasto_fijo_id) vinculados.add(m.gasto_fijo_id)
    const ars = montoARS(m, opts.dolar)
    if (m.tipo_movimiento === 'Ingreso') {
      if (esTarjeta(m)) reintegrosTC += ars
      else              ingresosCash += ars
    } else if (m.tipo_movimiento === 'Gasto') {
      if (esTarjeta(m)) gastosTC    += ars
      else              otrosGastos += ars
    }
    // Transferencias: no cambian el neto proyectado (mueven plata entre cuentas propias).
  }

  let gfEfectivoPendiente = 0, gfTarjetaPendiente = 0
  for (const g of opts.gastosFijos) {
    if (vinculados.has(g.id)) continue  // su consumo ya está cargado como movimiento
    const ars = g.moneda === 'USD' ? g.monto_estimado * opts.dolar : g.monto_estimado
    if (g.cuentas?.tipo_cuenta === 'Tarjeta Credito') gfTarjetaPendiente += ars
    else                                              gfEfectivoPendiente += ars
  }

  return {
    periodo:             opts.periodo,
    totalIngresos:       ingresosCash,
    totalTC:             gastosTC - reintegrosTC,
    totalOtrosGastos:    otrosGastos,
    gfEfectivoPendiente,
    gfTarjetaPendiente,
  }
}

// ── Cálculo iterativo de proyecciones ─────────────────────────────────────

/**
 * Itera mes a mes acumulando el saldo:
 *
 *   saldo_t = saldo_{t-1} + ingresos_t
 *           - gfEfectivoPendiente_t - gfTarjetaPendiente_t
 *           - gastosTC_t - otrosGastos_t
 *
 * Los gastos fijos entran POR MES y solo los pendientes (sin movimiento
 * vinculado en ese período) — así un consumo ya cargado no se resta dos veces.
 *
 * Los primeros `skipCount` meses no se devuelven (mes actual + previos al
 * "desde"), pero se computan para arrastrar el saldo.
 */
export function calcularProyeccionesIterativo(opts: {
  startSaldo: number
  meses:      ReadonlyArray<MesData>
  skipCount:  number
}): {
  saldoBase:      number
  saldoInicioMes: number
  proyecciones:   ProyeccionMes[]
  datosDelMes:    { totalIng: number; totalTC: number; totalOtros: number; gfEfectivo: number; gfTarjeta: number }
} {
  let saldo          = Math.round(opts.startSaldo)
  let saldoBase      = saldo
  let saldoInicioMes = Math.round(opts.startSaldo)
  let datosDelMes    = { totalIng: 0, totalTC: 0, totalOtros: 0, gfEfectivo: 0, gfTarjeta: 0 }
  const proyecciones: ProyeccionMes[] = []

  for (let i = 1; i <= opts.meses.length; i++) {
    const m = opts.meses[i - 1]

    if (i === opts.skipCount) saldoInicioMes = saldo

    saldo = Math.round(
      saldo + m.totalIngresos
        - m.gfEfectivoPendiente
        - m.gfTarjetaPendiente
        - m.totalTC
        - m.totalOtrosGastos
    )

    if (i === opts.skipCount) {
      saldoBase = saldo
      datosDelMes = {
        totalIng:   Math.round(m.totalIngresos),
        totalTC:    Math.round(m.totalTC),
        totalOtros: Math.round(m.totalOtrosGastos),
        gfEfectivo: Math.round(m.gfEfectivoPendiente),
        gfTarjeta:  Math.round(m.gfTarjetaPendiente),
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
        gastos_fijos:   Math.round(m.gfEfectivoPendiente + m.gfTarjetaPendiente),
        gastos_tarjeta: Math.round(m.totalTC),
        gastos_otros:   Math.round(m.totalOtrosGastos),
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
