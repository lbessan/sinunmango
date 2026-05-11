// ─── Helpers de fecha en zona Argentina ──────────────────────────────────────
//
// El servidor está fijado a AR (ver finanzas-lb/lib/timezone.ts y la función
// today_ar() en Postgres). El mobile usa estos helpers para mantener
// consistencia: si el usuario tiene el dispositivo en otra zona, igual vemos
// el mismo "hoy" que el server.
//
// Para greetings o UI puramente local (ej. "Hoy es lunes"), usar new Date()
// directo está bien — refleja la hora del dispositivo.

const AR_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Devuelve la fecha de hoy en AR como string YYYY-MM-DD.
 * Ej: "2026-05-10"
 */
export function todayAR(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).format(new Date())
}

/**
 * Devuelve el mes actual en AR como string YYYY-MM.
 * Usado para el query param `?mes=YYYY-MM` que el dashboard mobile manda al server.
 */
export function currentMesAR(): string {
  return todayAR().slice(0, 7)
}

/** Componentes (año, mes, día) de la fecha actual en AR. */
export function todayPartsAR(): { year: number; month: number; day: number } {
  const [y, m, d] = todayAR().split('-').map(Number)
  return { year: y, month: m, day: d }
}
