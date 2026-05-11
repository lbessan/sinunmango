// ─── Helpers de fecha/hora con zona horaria de Argentina ─────────────────────
//
// El servidor (Vercel) corre en UTC. A partir de las 21:00 hora Argentina, UTC
// ya pasó al día siguiente — un new Date() ingenuo devolvería "mañana" para el
// usuario. Estos helpers garantizan que "hoy" siempre es el día en AR.
//
// Usar SIEMPRE estos helpers en código server-side (server components, API
// routes, cron jobs) cuando se necesite "fecha de hoy" o "mes actual".

const AR_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Devuelve la fecha de hoy en AR como string YYYY-MM-DD.
 * Ej: "2026-05-10" (no "2026-05-11" aunque el servidor UTC ya esté en el día siguiente)
 */
export function todayAR(): string {
  // en-CA usa formato YYYY-MM-DD nativamente
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).format(new Date())
}

/**
 * Devuelve el mes actual en AR como string YYYY-MM.
 * Ej: "2026-05"
 */
export function currentMesAR(): string {
  return todayAR().slice(0, 7)
}

/**
 * Devuelve el primer día del mes actual en AR como string YYYY-MM-01.
 * Útil para campos como `periodo_tarjeta` que guardan el mes como YYYY-MM-01.
 */
export function primerDiaMesAR(): string {
  return todayAR().slice(0, 7) + '-01'
}

/**
 * Devuelve los componentes (año, mes, día) de la fecha actual en AR.
 * Útil cuando se necesita construir un Date a partir de la fecha local.
 */
export function todayPartsAR(): { year: number; month: number; day: number } {
  const [y, m, d] = todayAR().split('-').map(Number)
  return { year: y, month: m, day: d }
}
