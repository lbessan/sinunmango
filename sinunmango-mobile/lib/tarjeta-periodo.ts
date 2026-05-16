// ─── Lógica de períodos de tarjeta de crédito ───────────────────────────────
//
// COPIA de finanzas-lb/lib/tarjeta-periodo.ts — manténer en sync manualmente.
// La razón de duplicar es que el mobile (Expo) y la web (Next.js) son apps
// separadas y no comparten paquetes.
//
// Una compra hecha con tarjeta de crédito se asigna a un "período de tarjeta"
// según el día de cierre y vencimiento del resumen. Ejemplos:
//
//   Cierre día 25, Vence día 10 del mes siguiente.
//   Compra del 5 de abril → cierra 25 de abril → vence 10 de mayo → período: 2026-05-01
//   Compra del 27 de abril → cierra 25 de mayo → vence 10 de junio → período: 2026-06-01

/**
 * Calcula el período de tarjeta (YYYY-MM-01) en que vence el pago de la compra.
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
      if (vence <= cierre) mes++
    } else {
      if (vence > cierre) mes++
      else                mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }

  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

/**
 * Suma N meses a una fecha en formato YYYY-MM-DD.
 *
 * Clampea al último día del mes destino cuando el día original no existe
 * (ej. 31 ene + 1 mes → 28 feb, no 3 mar como tirría `setMonth` directo).
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

/** Remueve el sufijo "(Cuota N/T)" del final de un detalle. */
export function stripCuotaSuffix(detalle: string | null | undefined): string {
  if (!detalle) return ''
  return detalle.replace(/\s*\(Cuota\s+\d+(?:\/\d+)?\)\s*$/i, '').trim()
}
