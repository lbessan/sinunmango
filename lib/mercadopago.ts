// ─── Mercado Pago — helpers centralizados ──────────────────────────────────
//
// Wrapper liviano sobre la API REST de MP. NO usamos el SDK oficial
// (`mercadopago` en npm) porque:
//   1. Es chico — son 4 endpoints que nos importan.
//   2. El SDK arrastra Node-specific deps que no juegan bien con edge runtime.
//   3. Mantenemos control total del shape de errors + retries.
//
// Variables de entorno requeridas:
//   MP_ACCESS_TOKEN          — token privado (TEST-... en sandbox, APP_... en prod)
//   MP_WEBHOOK_SECRET        — secret para validar firma del webhook (x-signature)
//   APP_URL                  — base URL pública (ej: https://app.sinunmango.com.ar)
//                              usada para construir back_url y notification_url
//
// Docs MP que usamos:
//   - Preapproval (suscripciones): https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
//   - Webhook signature:           https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#editor_3

import crypto from 'crypto'

// ── Configuración de planes ────────────────────────────────────────────────
//
// Single source of truth para los precios. Si cambia el precio en el futuro,
// se cambia acá y se propaga al endpoint de subscribe + pricing card.
//
// EARLY_ACCESS_LIMIT: cuántos suscriptores pagan el precio early. Una vez
// alcanzado, los siguientes pagan PRO_PRICE_ARS.
export const PRO_PRICE_ARS           = 6999
export const EARLY_ACCESS_PRICE_ARS  = 3499
export const EARLY_ACCESS_LIMIT      = 100
export const EARLY_ACCESS_DURATION_MONTHS = 12
export const TRIAL_DAYS              = 7

// ── Helpers de URL ─────────────────────────────────────────────────────────
function appUrl(): string {
  const base = process.env.APP_URL
  if (!base) throw new Error('APP_URL env var no configurada')
  return base.replace(/\/+$/, '')
}

function accessToken(): string {
  const tok = process.env.MP_ACCESS_TOKEN
  if (!tok) throw new Error('MP_ACCESS_TOKEN env var no configurada')
  return tok
}

function isSandbox(): boolean {
  // Tokens de sandbox empiezan con TEST- según las convenciones de MP.
  return accessToken().startsWith('TEST-')
}

// ── MP API base ────────────────────────────────────────────────────────────
const MP_BASE = 'https://api.mercadopago.com'

async function mpFetch<T>(
  path:    string,
  init?:   RequestInit,
): Promise<T> {
  const res = await fetch(`${MP_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${accessToken()}`,
      'Content-Type':  'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new MercadoPagoError(
      `MP ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body.slice(0, 400)}`,
      res.status,
      body,
    )
  }

  return res.json() as Promise<T>
}

export class MercadoPagoError extends Error {
  constructor(
    message:        string,
    public status:  number,
    public rawBody: string,
  ) {
    super(message)
    this.name = 'MercadoPagoError'
  }
}

// ── Preapproval (suscripción recurrente) ──────────────────────────────────

export type MpPreapprovalStatus =
  | 'pending'      // creado pero el user no autorizó aún
  | 'authorized'   // user autorizó, MP va a cobrar
  | 'paused'       // pausado por user o por nosotros (vía cancel)
  | 'cancelled'    // finalizado

export type MpPreapproval = {
  id:             string
  payer_id?:      number
  payer_email?:   string
  status:         MpPreapprovalStatus
  reason?:        string
  external_reference?: string
  init_point:     string  // URL para mandar al user a autorizar
  next_payment_date?: string
  auto_recurring: {
    frequency:           number
    frequency_type:      'months' | 'days'
    start_date?:         string  // ISO 8601
    end_date?:           string
    transaction_amount:  number
    currency_id:         'ARS'
  }
}

/**
 * Crea un preapproval (suscripción recurrente) en MP.
 *
 * El `external_reference` es el user_id de Supabase — nos permite mapear de
 * vuelta el preapproval al user cuando llega el webhook.
 *
 * `start_date` 7 días en el futuro = trial gratis (MP NO cobra hasta esa fecha,
 * pero el user ya autorizó la tarjeta).
 */
export async function createPreapproval(opts: {
  userId:            string
  payerEmail:        string
  amountArs:         number
  reason:            string
  startDate:         Date
  /** Para Pro standard / early access. Solo informativo, no afecta a MP. */
  externalReference: string
}): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      payer_email: opts.payerEmail,
      back_url:    `${appUrl()}/checkout/result`,
      reason:      opts.reason,
      external_reference: opts.externalReference,
      auto_recurring: {
        frequency:          1,
        frequency_type:     'months',
        start_date:         opts.startDate.toISOString(),
        transaction_amount: opts.amountArs,
        currency_id:        'ARS',
      },
      status: 'pending',  // MP lo pasa a 'authorized' cuando el user autoriza
    }),
  })
}

export async function getPreapproval(preapprovalId: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${preapprovalId}`)
}

/**
 * Pausa el preapproval (lo deja sin cobrar) — equivalente a "cancelar" desde
 * la perspectiva del user. MP no permite borrar preapprovals, solo pausarlos
 * o cancelarlos.
 *
 * En MP "paused" = el user puede reactivarlo después. "cancelled" = final.
 */
export async function pausePreapproval(preapprovalId: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${preapprovalId}`, {
    method: 'PUT',
    body:   JSON.stringify({ status: 'paused' }),
  })
}

/**
 * Cancela definitivamente. Se usa cuando termina el early access y queremos
 * forzar que el user re-suscriba a precio normal.
 */
export async function cancelPreapproval(preapprovalId: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${preapprovalId}`, {
    method: 'PUT',
    body:   JSON.stringify({ status: 'cancelled' }),
  })
}

// ── Payments ───────────────────────────────────────────────────────────────

export type MpPayment = {
  id:                  number
  status:              'approved' | 'rejected' | 'in_process' | 'refunded' | 'cancelled' | 'pending' | 'authorized'
  status_detail:       string
  transaction_amount:  number
  currency_id:         'ARS'
  date_created:        string
  date_approved?:      string
  payer:               { id?: number; email?: string }
  external_reference?: string
  description?:        string
  /** Si vino de un preapproval, el ID está acá. */
  metadata?: {
    preapproval_id?: string
    [k: string]: unknown
  }
}

export async function getPayment(paymentId: string | number): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${paymentId}`)
}

// ── Webhook signature verification ─────────────────────────────────────────
//
// MP firma cada webhook con HMAC-SHA256 usando el secret configurado en el
// dashboard. El header `x-signature` viene en formato:
//   ts=1234567890,v1=hexdigest
//
// El "manifest" sobre el que se calcula la firma es:
//   id:<resource_id>;request-id:<x-request-id>;ts:<ts>;
//
// Ref: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks

/**
 * Verifica que el webhook venga firmado por MP. Devuelve false si la firma
 * no matchea (descartar el evento). En sandbox MP a veces no firma — si no
 * está configurado el secret, devolvemos true para no bloquear desarrollo.
 */
export function verifyWebhookSignature(opts: {
  signatureHeader: string | null
  requestIdHeader: string | null
  resourceId:      string
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    if (isSandbox()) {
      console.warn('[mp] MP_WEBHOOK_SECRET no configurado — permitiendo en sandbox')
      return true
    }
    console.error('[mp] MP_WEBHOOK_SECRET requerido en prod')
    return false
  }

  if (!opts.signatureHeader || !opts.requestIdHeader) {
    console.warn('[mp] x-signature o x-request-id ausente')
    return false
  }

  // Parsear "ts=...,v1=..."
  const parts = Object.fromEntries(
    opts.signatureHeader.split(',').map(s => {
      const [k, ...rest] = s.split('=')
      return [k.trim(), rest.join('=').trim()]
    }),
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${opts.resourceId};request-id:${opts.requestIdHeader};ts:${ts};`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  // Comparación constant-time para no leak el tamaño del match parcial.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(v1, 'hex'),
    )
  } catch {
    return false
  }
}
