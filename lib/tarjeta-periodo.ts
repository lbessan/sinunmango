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
// REGLA ÚNICA: si la cuenta es tarjeta de crédito y tiene fechas de cierre y
// vencimiento cargadas, el movimiento se difiere al período del resumen —
// SIEMPRE, sin importar la moneda ni el tipo. Un consumo en dólares o un
// reintegro figuran en el resumen igual que cualquier otro y se pagan en su
// vencimiento. Si no es tarjeta (o le faltan fechas), el período es el mes de
// la fecha del movimiento.
//
// NO agregar condiciones extra (moneda !== 'USD', tipo === 'Gasto', etc.) en
// los callers: cada carve-out hace que el movimiento se guarde con un período
// distinto del que muestra el formulario de edición (que usa
// calcularPeriodoCuenta), y el usuario ve "período mal, lo abro y se corrige".

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

/**
 * ¿Este movimiento va en la sección "futuros" de la pantalla de una cuenta?
 *
 * REGLA ÚNICA, y depende del tipo de cuenta porque "futuro" significa cosas
 * distintas según qué estés mirando:
 *
 * - **Tarjeta de crédito** → futuro = el movimiento cae en un resumen que
 *   todavía no venció (`periodo_tarjeta` >= mes actual). El consumo de hoy ya
 *   está hecho, pero lo vas a PAGAR en el resumen que viene: mostrarlo agrupado
 *   con su período es lo que hace que la card del resumen esté completa.
 *
 * - **Cualquier otra cuenta** (billetera, banco, efectivo) → futuro = lo que
 *   todavía no pasó: `fecha` posterior a hoy. Acá el período es simplemente el
 *   mes del movimiento, así que cortar por período mandaba TODO el mes en curso
 *   a "futuros" y la lista principal quedaba congelada en el mes anterior.
 *   Es el mismo criterio que usa /movimientos (`fecha > hoy`), así que las dos
 *   pantallas coinciden.
 */
export function esMovimientoFuturo(
  mov: { fecha?: string | null; periodo_tarjeta?: string | null },
  opts: { esTarjeta: boolean; hoy: string }
): boolean {
  if (opts.esTarjeta) {
    // Sin período no podemos ubicarlo en un resumen: lo tratamos como historial.
    if (!mov.periodo_tarjeta) return false
    return mov.periodo_tarjeta >= opts.hoy.slice(0, 7) + '-01'
  }
  if (!mov.fecha) return false
  return mov.fecha > opts.hoy
}
