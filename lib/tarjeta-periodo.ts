// ─── Lógica de períodos de tarjeta de crédito ───────────────────────────────
//
// Una compra hecha con tarjeta de crédito se asigna a un "período de tarjeta"
// según el día de cierre y vencimiento del resumen. Ejemplos:
//
//   Cierre día 25, Vence día 10 del mes siguiente.
//   Compra del 5 de abril → cierra 25 de abril → vence 10 de mayo → período: 2026-05-01
//   Compra del 27 de abril → cierra 25 de mayo → vence 10 de junio → período: 2026-06-01
//
// El "período" se guarda como YYYY-MM-01 (el mes en que vence el pago) para que
// las queries y agregaciones por período sean simples.
//
// Si no es tarjeta o es un consumo en USD (que típicamente se cobra al cambio
// del día de vencimiento, sin diferimiento), el período es simplemente el mes
// de la fecha de compra.

/**
 * Calcula el período de tarjeta (YYYY-MM-01) en que vence el pago de la compra.
 *
 * @param fecha     Fecha de la compra en formato YYYY-MM-DD.
 * @param cierre    Día del mes de cierre del resumen (1-31) o null.
 * @param vence     Día del mes de vencimiento del pago (1-31) o null.
 * @param esTarjeta True si la cuenta es tarjeta de crédito (sólo entonces se difiere).
 */
export function calcularPeriodo(
  fecha: string,
  cierre: number | null,
  vence: number | null,
  esTarjeta: boolean
): string {
  const d  = new Date(fecha + 'T12:00:00')
  let mes  = d.getMonth()
  let anio = d.getFullYear()

  if (esTarjeta && cierre && vence) {
    const day = d.getDate()
    if (day <= cierre) {
      // Antes o el día del cierre: vence este mismo período de cierre.
      // Si el vencimiento cae después del cierre (mismo mes), el pago es este mes;
      // si el vencimiento cae antes del cierre, el pago es el mes siguiente.
      if (vence <= cierre) mes++
    } else {
      // Después del cierre: la compra entra al próximo resumen.
      if (vence > cierre) mes++
      else                mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }

  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

/**
 * Suma N meses a una fecha en formato YYYY-MM-DD y devuelve el resultado en
 * el mismo formato. Usado para generar las fechas de cada cuota mensual.
 *
 * Clampea al último día del mes destino cuando el día original no existe
 * (ej. 31 ene + 1 mes → 28 feb, no 3 mar como tirría `setMonth` directo).
 * Esto matchea cómo las tarjetas argentinas asignan cuotas a fin de mes.
 */
export function addMonths(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00')
  const originalDay = d.getDate()
  // setDate(1) ANTES de cambiar mes evita el overflow nativo de JS:
  // new Date('2026-01-31').setMonth(1) → 3 mar (porque feb no tiene 31 y JS
  // suma los días sobrantes). Con día=1 setMonth cae limpio, después
  // clampeamos al día original (o al último del mes si no existe).
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(originalDay, lastDayOfMonth))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Remueve el sufijo "(Cuota N/T)" o "(Cuota N)" del final de un detalle.
 *
 * Lo usamos al renderizar listas/tablas de movimientos: el detalle se guarda
 * en la DB con el sufijo (para que sea identificable y agrupable por regex),
 * pero la UI ya muestra "Cuota X/Y" como subtitle aparte. Strippear el sufijo
 * evita duplicación visual del tipo "COTO (Cuota 5/12)" + abajo "Cuota 5/12".
 */
export function stripCuotaSuffix(detalle: string | null | undefined): string {
  if (!detalle) return ''
  return detalle.replace(/\s*\(Cuota\s+\d+(?:\/\d+)?\)\s*$/i, '').trim()
}

/**
 * Decide si las fechas del PRÓXIMO ciclo deben diferirse (guardarse como
 * pendientes) en vez de aplicarse de inmediato.
 *
 * Se difiere mientras el ciclo actual NO venció: si hoy es anterior al
 * vencimiento actual, todavía estamos operando en el ciclo viejo (compras
 * tardías que le pertenecen + alerta de pago pendiente), así que avanzar las
 * fechas ahora reclasificaría compras y rompería el aviso de vencimiento.
 *
 * - Sin vencimiento actual (tarjeta recién configurada) → NO diferir (aplicar
 *   directo, no hay ciclo que proteger).
 * - hoy < vencimiento actual → diferir.
 * - hoy >= vencimiento actual → aplicar directo (el ciclo ya venció / vence hoy).
 */
export function debeDeferirFechas(
  vencActualISO: string | null | undefined,
  hoy: Date = new Date()
): boolean {
  if (!vencActualISO) return false
  const venc   = new Date(vencActualISO + 'T12:00:00')
  const hoyMid = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const vencMid = new Date(venc.getFullYear(), venc.getMonth(), venc.getDate())
  return hoyMid < vencMid
}

/**
 * Variante de `calcularPeriodo` que recibe el objeto cuenta directamente
 * (extrae los días de cierre/vencimiento internamente). Cómodo para los
 * formularios donde ya tenés la cuenta cargada.
 *
 * Si la cuenta no es tarjeta o no tiene fechas de cierre/vencimiento,
 * devuelve el mes de la fecha de compra (YYYY-MM-01).
 */
export function calcularPeriodoCuenta(
  fecha: string,
  cuenta:
    | { tipo_cuenta?: string | null; fecha_cierre_tarjeta?: string | null; fecha_vencimiento_tarjeta?: string | null }
    | null
    | undefined
): string {
  if (!cuenta || cuenta.tipo_cuenta !== 'Tarjeta Credito') return fecha.slice(0, 7) + '-01'
  if (!cuenta.fecha_cierre_tarjeta || !cuenta.fecha_vencimiento_tarjeta) return fecha.slice(0, 7) + '-01'
  const cierre = new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate()
  const vence  = new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate()
  return calcularPeriodo(fecha, cierre, vence, true)
}
