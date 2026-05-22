import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import {
  getPayment,
  getPreapproval,
  verifyWebhookSignature,
  type MpPayment,
  type MpPreapproval,
} from '@/lib/mercadopago'
import type { Database } from '@/lib/database.types'

// ─── POST /api/webhooks/mp ──────────────────────────────────────────────────
//
// Receptor de webhooks de Mercado Pago. MP nos manda un evento cada vez que:
//   - Cambia el estado de un preapproval (autorizado / pausado / cancelado)
//   - Se crea/cobra/rechaza un payment del preapproval
//
// El body típico de MP es:
//   {
//     "type": "subscription_preapproval" | "subscription_authorized_payment" | "payment",
//     "action": "...",
//     "data": { "id": "preapproval_id_or_payment_id" }
//   }
//
// Acciones que tomamos:
//   - subscription_preapproval     → actualizar mp_status del user.
//   - subscription_authorized_payment / payment → si está approved:
//        plan='pro', plan_expires_at='+1 mes', insert en payments.
//   - status 'paused' / 'cancelled' → mp_status='paused' o 'cancelled'.
//        plan sigue 'pro' hasta plan_expires_at (grace period del ciclo
//        ya pagado), después degrada por el cron de subscription_expire.
//
// Idempotencia: usamos mp_payment_id como UNIQUE en payments. Si MP reenvía
// el mismo evento (cosa que sí hace), el INSERT falla con conflict y
// terminamos silenciosamente sin double-charge.
//
// Respondemos 200 incluso si fallamos al procesar el evento — MP reintenta
// con backoff si responde 5xx. Solo devolvemos 4xx si el body es claramente
// inválido (sin id, type desconocido, etc).

// MP usa GET para algunos pings de validación; respondemos 200.
export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  // ── 1. Verificar firma ────────────────────────────────────────────────
  const signature = req.headers.get('x-signature')
  const requestId = req.headers.get('x-request-id')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn('[mp/webhook] JSON inválido')
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const event = body as {
    type?:   string
    action?: string
    data?:   { id?: string | number }
    id?:     string | number
  }

  const resourceId = String(event.data?.id ?? event.id ?? '')
  if (!resourceId) {
    console.warn('[mp/webhook] sin resource id en el body')
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  const sigOk = verifyWebhookSignature({
    signatureHeader: signature,
    requestIdHeader: requestId,
    resourceId,
  })
  if (!sigOk) {
    console.warn(`[mp/webhook] firma inválida resource=${resourceId}`)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // ── 2. Despachar según tipo de evento ─────────────────────────────────
  const type = event.type ?? 'unknown'
  console.log(`[mp/webhook] received type=${type} resource=${resourceId}`)

  try {
    switch (type) {
      case 'subscription_preapproval':
        await handlePreapprovalEvent(resourceId)
        break

      case 'subscription_authorized_payment':
      case 'payment':
        await handlePaymentEvent(resourceId, body)
        break

      default:
        console.log(`[mp/webhook] type ignorado: ${type}`)
    }
  } catch (err) {
    // No devolvemos 500 a MP — solo loggeamos. Si necesitamos retry, lo
    // hace el cron de reconciliación (a implementar más adelante).
    console.error('[mp/webhook] error procesando:', err)
  }

  return NextResponse.json({ ok: true })
}

// ── Handler: cambio de estado del preapproval ──────────────────────────────
async function handlePreapprovalEvent(preapprovalId: string): Promise<void> {
  const pre = await getPreapproval(preapprovalId)

  // external_reference es el user_id de Supabase. Si por alguna razón no
  // está (no debería pasar), buscamos por mp_preapproval_id como fallback.
  const userId = pre.external_reference ?? null

  const updates: Database['public']['Tables']['user_profiles']['Update'] = {
    mp_status:        pre.status,
    plan_renews_at:   pre.next_payment_date ?? null,
  }

  // Cuando el preapproval queda 'authorized', el user es Pro. Pero el
  // cobro real recién pasa en next_payment_date. Igual le activamos el
  // plan ahora porque el preapproval autorizado significa "compromiso
  // de pago" y queremos darle acceso inmediato durante el trial.
  if (pre.status === 'authorized') {
    updates.plan = 'pro'
    // plan_expires_at = next_payment_date (cuando MP intenta el primer cobro)
    if (pre.next_payment_date) updates.plan_expires_at = pre.next_payment_date
  }

  // 'paused' o 'cancelled' = el user no va a recibir más cobros. Plan
  // sigue Pro hasta plan_expires_at (grace) y después el sidebar / app
  // lo trata como Free al chequear plan_expires_at vs NOW().
  // No tocamos plan acá — eso lo hace un cron diario (a implementar)
  // o se chequea on-the-fly al leer getUserPlan().

  const query = userId
    ? adminClient.from('user_profiles').update(updates).eq('user_id', userId)
    : adminClient.from('user_profiles').update(updates).eq('mp_preapproval_id', preapprovalId)

  const { error } = await query
  if (error) {
    console.error('[mp/webhook/preapproval] update error:', error)
    throw error
  }

  console.log(
    `[mp/webhook/preapproval] preapproval=${preapprovalId} status=${pre.status}` +
      (userId ? ` user=${userId}` : ''),
  )
}

// ── Handler: payment (cobro individual) ────────────────────────────────────
async function handlePaymentEvent(paymentId: string, rawEvent: unknown): Promise<void> {
  const payment = await getPayment(paymentId)
  const userId = payment.external_reference ?? null
  const preapprovalId = payment.metadata?.preapproval_id as string | undefined

  if (!userId && !preapprovalId) {
    console.warn(`[mp/webhook/payment] payment=${paymentId} sin user mapeable`)
    return
  }

  // ── Insertar en payments con idempotencia ────────────────────────────
  // mp_payment_id es UNIQUE. Si ya existe, el INSERT explota — usamos
  // upsert con onConflict para no romper.
  if (userId) {
    const { error: insErr } = await adminClient
      .from('payments')
      .upsert(
        {
          user_id:           userId,
          mp_payment_id:     String(payment.id),
          mp_preapproval_id: preapprovalId ?? null,
          amount:            payment.transaction_amount,
          currency:          payment.currency_id,
          status:            payment.status,
          status_detail:     payment.status_detail,
          raw_event:         rawEvent as never,
        },
        { onConflict: 'mp_payment_id' },
      )
    if (insErr) {
      console.error('[mp/webhook/payment] upsert error:', insErr)
    }
  }

  // ── Si el pago fue approved, extender plan ───────────────────────────
  if (payment.status === 'approved') {
    // plan_expires_at = ahora + 1 mes
    const nextRenewal = new Date()
    nextRenewal.setMonth(nextRenewal.getMonth() + 1)

    const updates: Database['public']['Tables']['user_profiles']['Update'] = {
      plan:            'pro',
      plan_expires_at: nextRenewal.toISOString(),
      plan_renews_at:  nextRenewal.toISOString(),
      mp_status:       'authorized',
    }

    if (payment.payer.id) updates.mp_payer_id = String(payment.payer.id)

    const query = userId
      ? adminClient.from('user_profiles').update(updates).eq('user_id', userId)
      : adminClient.from('user_profiles').update(updates).eq('mp_preapproval_id', preapprovalId!)

    const { error } = await query
    if (error) console.error('[mp/webhook/payment] update profile error:', error)
  }

  console.log(
    `[mp/webhook/payment] payment=${paymentId} status=${payment.status}` +
      (userId ? ` user=${userId}` : ''),
  )
}
