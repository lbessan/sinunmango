// ─── lib/afipsdk.ts ──────────────────────────────────────────────────────────
//
// Cliente de la API de automations de Afip SDK (app.afipsdk.com).
//
// Usamos la automation `monotributo-info`: Afip SDK loguea con CUIT + clave
// fiscal en ARCA (headless, de su lado) y devuelve categoría, facturación
// acumulada, tope de la categoría y próxima cuota. Con esto reemplazamos la
// carga manual del monotributo.
//
// La API es ASÍNCRONA:
//   POST /api/v1/automations           → arranca el job, devuelve { id, status }
//   GET  /api/v1/automations/:id        → estado; status 'in_process' hasta que termina
//
// Auth: header `Authorization: Bearer <AFIPSDK_TOKEN>` (env, solo server).
// La clave fiscal NUNCA se expone al cliente ni se loguea; se usa solo acá.
//
// Contrato (verificado contra la API real):
//   request  body: { automation: 'monotributo-info',
//                    params: { cuit, username, password } }   (los 3 obligatorios)
//   response data: { category, billed_amount, billing_update_date,
//                    category_limit, next_due_date, next_due_amount }

const BASE = 'https://app.afipsdk.com/api/v1'
const AUTOMATION = 'monotributo-info'

/** Snapshot normalizado de la consulta de monotributo. */
export type MonotributoSync = {
  categoria: string | null           // 'A'..'K' (category)
  facturado: number | null           // billed_amount — facturación acumulada oficial de ARCA
  fechaFacturado: string | null      // billing_update_date — al cuándo está actualizada (DD/MM/YYYY)
  topeCategoria: number | null       // category_limit — límite anual de la categoría
  proximoVencimiento: string | null  // next_due_date (DD/MM/YYYY)
  cuotaMensual: number | null        // next_due_amount — costo mensual a pagar
}

/** Respuesta cruda de un job de automation. */
export type AfipSdkJob = {
  id?: string
  status?: string                        // 'in_process' | 'complete' | 'error' | ...
  data?: Record<string, unknown> | null
  error?: unknown
  message?: string
}

/** Error de Afip SDK con contexto (status HTTP + errores de validación). */
export class AfipSdkError extends Error {
  status?: number
  dataErrors?: unknown
  constructor(message: string, opts?: { status?: number; dataErrors?: unknown }) {
    super(message)
    this.name = 'AfipSdkError'
    this.status = opts?.status
    this.dataErrors = opts?.dataErrors
  }
}

function getToken(): string {
  const t = process.env.AFIPSDK_TOKEN
  if (!t) throw new AfipSdkError('Falta AFIPSDK_TOKEN en el server')
  return t
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
}

/** Convierte cualquier valor a número (tolera "$1.234,56", null, etc.). */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    // Formato AR: punto=miles, coma=decimal. Si ya viene en formato JS (punto
    // decimal, sin miles), no lo rompemos: solo tratamos coma como decimal.
    const hasComma = v.includes(',')
    const clean = hasComma
      ? v.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')
      : v.replace(/[^\d.-]/g, '')
    const n = Number(clean)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Mapea la `data` de la automation a nuestro shape. Tolerante a campos faltantes. */
export function normalizarMonotributo(data: Record<string, unknown> | null | undefined): MonotributoSync {
  const d = (data ?? {}) as Record<string, unknown>
  return {
    categoria: toStr(d.category),
    facturado: toNum(d.billed_amount),
    fechaFacturado: toStr(d.billing_update_date),
    topeCategoria: toNum(d.category_limit),
    proximoVencimiento: toStr(d.next_due_date),
    cuotaMensual: toNum(d.next_due_amount),
  }
}

async function parseJob(res: Response): Promise<AfipSdkJob> {
  let body: unknown = null
  try { body = await res.json() } catch { /* body no-JSON */ }
  const b = (body ?? {}) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      (typeof b.message === 'string' && b.message) ||
      (b.data_errors ? 'AFIP rechazó los datos enviados' : null) ||
      `Afip SDK respondió ${res.status}`
    throw new AfipSdkError(msg, { status: res.status, dataErrors: b.data_errors })
  }
  return b as AfipSdkJob
}

/** Arranca la automation de monotributo. Devuelve el job (con id y quizá resultado inmediato). */
export async function iniciarMonotributo(creds: { cuit: string; clave: string }): Promise<AfipSdkJob> {
  const res = await fetch(`${BASE}/automations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      automation: AUTOMATION,
      params: { cuit: creds.cuit, username: creds.cuit, password: creds.clave },
    }),
  })
  return parseJob(res)
}

/** Consulta el estado de un job por id. */
export async function consultarJob(jobId: string): Promise<AfipSdkJob> {
  const res = await fetch(`${BASE}/automations/${encodeURIComponent(jobId)}`, { headers: authHeaders() })
  return parseJob(res)
}

const ESTADOS_EN_PROCESO = new Set(['in_process', 'in process', 'pending', 'processing', 'created'])

/** ¿El job sigue corriendo? */
export function jobEnProceso(status?: string): boolean {
  return !!status && ESTADOS_EN_PROCESO.has(status.toLowerCase())
}

/** ¿El job terminó con error? */
export function jobConError(job: AfipSdkJob): boolean {
  const s = (job.status ?? '').toLowerCase()
  return s === 'error' || s === 'failed' || s === 'fail'
}

/** Mensaje de error amigable a partir de un job fallido. */
export function mensajeErrorJob(job: AfipSdkJob): string {
  if (typeof job.message === 'string' && job.message.trim()) return job.message.trim()
  if (typeof job.error === 'string' && job.error.trim()) return job.error.trim()
  if (job.error && typeof job.error === 'object') {
    const m = (job.error as Record<string, unknown>).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  return 'AFIP rechazó la consulta. Revisá tu CUIT y clave fiscal e intentá de nuevo.'
}

/**
 * Poll completo: arranca la automation y espera hasta que termine. Pensado para
 * usos server sincrónicos (ej. cron). En rutas de Vercel preferí el patrón
 * fire-and-poll en 2 requests (iniciar + consultar) para no colgar la función.
 *
 * Tira AfipSdkError si falla, si el job termina en error, o si supera el timeout.
 */
export async function consultarMonotributo(
  creds: { cuit: string; clave: string },
  opts: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<MonotributoSync> {
  const intervalMs = opts.intervalMs ?? 5000
  const timeoutMs = opts.timeoutMs ?? 120000
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const now = opts.now ?? (() => Date.now())

  let job = await iniciarMonotributo(creds)
  const deadline = now() + timeoutMs
  while (jobEnProceso(job.status)) {
    if (!job.id) throw new AfipSdkError('Afip SDK no devolvió un id de job para pollear')
    if (now() > deadline) throw new AfipSdkError('La consulta a AFIP tardó demasiado (timeout)')
    await sleep(intervalMs)
    job = await consultarJob(job.id)
  }
  if (jobConError(job)) throw new AfipSdkError(mensajeErrorJob(job))
  return normalizarMonotributo(job.data)
}
