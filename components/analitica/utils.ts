// ─── Tipos y helpers compartidos de Analítica ────────────────────────────────

export type MovAnalitica = {
  id: string
  fecha: string
  tipo_movimiento: string
  monto: number
  monto_estimado: number | null
  detalle: string | null
  categoria_nombre: string | null
  categoria_icono: string | null
  subcategoria: string | null   // subcategoria ID
  cuotas_total: number | null    // 1 (o null) = compra única; >1 = compra en cuotas
  grupo_cuotas: string | null   // identifica el grupo de cuotas de la misma compra
  cuenta_origen_nombre: string | null
  cuenta_origen_tipo:   string | null
}

export type Subcategoria = {
  id: string
  nombre_subcategoria: string
  categoria_padre: string
}

export type Preset = '1M' | '3M' | '6M' | '12M' | 'todo' | 'custom'

export const PRESET_LABELS: Record<Preset, string> = {
  '1M':     'Este mes',
  '3M':     '3 meses',
  '6M':     '6 meses',
  '12M':    '12 meses',
  'todo':   'Todo',
  'custom': 'Personalizado',
}

type StandardPreset = Exclude<Preset, 'custom'>

export function getDateRange(preset: StandardPreset): { desde: Date; hasta: Date } {
  const now   = new Date()
  const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  if (preset === 'todo') return { desde: new Date(2000, 0, 1), hasta }
  const offset: Record<StandardPreset, number> = { '1M': 0, '3M': 2, '6M': 5, '12M': 11, 'todo': 0 }
  const desde = new Date(now.getFullYear(), now.getMonth() - offset[preset], 1)
  return { desde, hasta }
}

export function getMeses(desde: Date, hasta: Date): string[] {
  const out: string[] = []
  const cur = new Date(desde.getFullYear(), desde.getMonth(), 1)
  const end = new Date(hasta.getFullYear(), hasta.getMonth(), 1)
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

/** Cuántos días distintos hay entre dos fechas, inclusive. */
export function diasEntre(desde: Date, hasta: Date): number {
  const ms = hasta.getTime() - desde.getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/** Devuelve el monto efectivo de un movimiento (estimado si existe, sino monto). */
export function montoOf(m: { monto: number; monto_estimado: number | null }): number {
  return m.monto_estimado ?? m.monto
}

/** Formato número argentino sin decimales. */
export const fmt  = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

/** Formato compacto: 1234 → "1.2k", 1500000 → "1.5M". */
export const fmtK = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}M`
  if (abs >= 1_000)     return `${(n / 1_000).toLocaleString('es-AR',     { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`
  return fmt(n)
}

/** Parsea fecha ISO YYYY-MM-DD a Date local. */
export function parseFecha(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}

/** Formato fecha legible: "Vie 15 May". */
export function formatFechaCorta(iso: string): string {
  return parseFecha(iso).toLocaleDateString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short',
  }).replace('.', '').replace(/^\w/, c => c.toUpperCase())
}

/** Diferencia porcentual entre dos valores. Null si el anterior es 0. */
export function pctDelta(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((actual - anterior) / anterior) * 100
}
