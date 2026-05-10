// ─── Validators ──────────────────────────────────────────────────────────────
// Helpers para validar payloads de API routes. Estilo "Result" — devuelven el
// valor validado (con casteo de tipo) o un error descriptivo. Los routes los
// usan para construir validaciones específicas sin depender de zod.
//
// Patrón típico en un route:
//
//   const v = validateBody(body)
//   if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
//   const insert = v.data
//
// La función validateBody la define cada route con sus propias reglas.

export type Validated<T> = { ok: true; data: T } | { ok: false; error: string }

// Regex compartidos
export const ID_PATTERN     = /^[a-zA-Z0-9_-]{1,64}$/
export const ISO_DATE       = /^\d{4}-\d{2}-\d{2}$/
export const HEX_COLOR      = /^#[0-9a-fA-F]{6}$/
export const TERMINACION_4  = /^\d{4}$/

// ─── Primitivos ──────────────────────────────────────────────────────────────

export function isString(v: unknown): v is string {
  return typeof v === 'string'
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ─── Validators con rangos / formatos ────────────────────────────────────────

/** String con trim + min/max length. */
export function validateString(
  v: unknown,
  { min = 1, max = 200, field = 'campo' }: { min?: number; max?: number; field?: string } = {}
): Validated<string> {
  if (!isString(v)) return { ok: false, error: `${field} inválido` }
  const t = v.trim()
  if (t.length < min) return { ok: false, error: `${field} muy corto (mín ${min} caracteres)` }
  if (t.length > max) return { ok: false, error: `${field} muy largo (máx ${max} caracteres)` }
  return { ok: true, data: t }
}

/** Número finito > 0 (o >= 0 si min=0). */
export function validatePositiveNumber(
  v: unknown,
  { max = 1_000_000_000, allowZero = false, field = 'monto' }: { max?: number; allowZero?: boolean; field?: string } = {}
): Validated<number> {
  if (!isFiniteNumber(v)) return { ok: false, error: `${field} inválido` }
  if (allowZero ? v < 0 : v <= 0) {
    return { ok: false, error: `${field} debe ser ${allowZero ? '>= 0' : '> 0'}` }
  }
  if (v > max) return { ok: false, error: `${field} fuera de rango (máx ${max.toLocaleString()})` }
  return { ok: true, data: v }
}

/** Número finito (positivo o negativo) con rango. */
export function validateFiniteNumber(
  v: unknown,
  { min = -1_000_000_000, max = 1_000_000_000, field = 'valor' }: { min?: number; max?: number; field?: string } = {}
): Validated<number> {
  if (!isFiniteNumber(v)) return { ok: false, error: `${field} inválido` }
  if (v < min || v > max) return { ok: false, error: `${field} fuera de rango` }
  return { ok: true, data: v }
}

/** Entero en rango cerrado. */
export function validateInteger(
  v: unknown,
  { min, max, field = 'entero' }: { min: number; max: number; field?: string }
): Validated<number> {
  if (!isInteger(v)) return { ok: false, error: `${field} debe ser entero` }
  if (v < min || v > max) return { ok: false, error: `${field} debe estar entre ${min} y ${max}` }
  return { ok: true, data: v }
}

/** Enum: el valor tiene que estar en la lista exacta. */
export function validateEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field = 'valor'
): Validated<T> {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    return { ok: false, error: `${field} inválido (esperado: ${allowed.join(', ')})` }
  }
  return { ok: true, data: v as T }
}

/** Fecha ISO YYYY-MM-DD parseable. */
export function validateISODate(v: unknown, field = 'fecha'): Validated<string> {
  if (!isString(v) || !ISO_DATE.test(v)) {
    return { ok: false, error: `${field} debe tener formato YYYY-MM-DD` }
  }
  const dt = new Date(v + 'T12:00:00')
  if (isNaN(dt.getTime())) return { ok: false, error: `${field} inválida` }
  return { ok: true, data: v }
}

/** ID alfanumérico + _ y - (hasta 64 chars). Mismo patrón usado en upload-imagen. */
export function validateId(v: unknown, field = 'id'): Validated<string> {
  if (!isString(v) || !ID_PATTERN.test(v)) {
    return { ok: false, error: `${field} inválido` }
  }
  return { ok: true, data: v }
}

/** Color hex tipo "#0d3b6e". */
export function validateHexColor(v: unknown, field = 'color'): Validated<string> {
  if (!isString(v) || !HEX_COLOR.test(v)) {
    return { ok: false, error: `${field} debe ser un color hex (ej #0d3b6e)` }
  }
  return { ok: true, data: v }
}

/** Boolean estricto. */
export function validateBoolean(v: unknown, field = 'valor'): Validated<boolean> {
  if (!isBoolean(v)) return { ok: false, error: `${field} debe ser booleano` }
  return { ok: true, data: v }
}

/** Optional helper: si el valor es undefined/null devuelve null OK; sino aplica el validator. */
export function optional<T>(
  v: unknown,
  validator: (val: unknown) => Validated<T>
): Validated<T | null> {
  if (v === undefined || v === null || v === '') return { ok: true, data: null }
  const r = validator(v)
  if (!r.ok) return r
  return { ok: true, data: r.data }
}
