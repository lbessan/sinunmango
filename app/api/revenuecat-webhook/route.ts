import { NextRequest, NextResponse } from 'next/server'
import { updateUserPlan } from '@/lib/subscription'

// ─── POST /api/revenuecat-webhook ───────────────────────────────────────────
//
// Recibe webhooks de RevenueCat cuando hay cambios en suscripciones de un user.
// Eventos relevantes:
//   - INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE / UNCANCELLATION  → plan='pro'
//   - CANCELLATION  → mantenemos pro pero actualizamos plan_expires_at
//   - EXPIRATION / BILLING_ISSUE  → plan='free'
//   - SUBSCRIBER_ALIAS, TRANSFER, NON_RENEWING_PURCHASE: ignorados por ahora
//
// Seguridad: RevenueCat manda un header Authorization custom configurado por
// nosotros en su dashboard. Validamos contra REVENUECAT_WEBHOOK_SECRET.
//
// `app_user_id` viene del cliente cuando hace Purchases.configure({ appUserID })
// y nosotros le pasamos el Supabase user.id (ver SubscriptionContext.tsx).

export const runtime = 'nodejs'

type RCEvent = {
  type: string
  app_user_id?: string
  product_id?: string
  transaction_id?: string
  expiration_at_ms?: number
  purchased_at_ms?: number
  environment?: 'SANDBOX' | 'PRODUCTION'
}

export async function POST(req: NextRequest) {
  // ── Verificar shared secret ─────────────────────────────────────────────
  const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!expectedSecret) {
    console.error('[revenuecat-webhook] REVENUECAT_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[revenuecat-webhook] Authorization inválida')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parsear body ────────────────────────────────────────────────────────
  let body: { event?: RCEvent; api_version?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = body.event
  if (!event) {
    return NextResponse.json({ error: 'Missing event' }, { status: 400 })
  }

  const userId    = event.app_user_id
  const eventType = event.type
  const env       = event.environment ?? 'PRODUCTION'

  if (!userId) {
    console.warn('[revenuecat-webhook] Event sin app_user_id — ignorado')
    return NextResponse.json({ ok: true, skipped: 'no_user_id' })
  }

  // RC manda events en sandbox durante testing — los procesamos igual para
  // poder validar el flow en internal testing. Lo loggeamos para visibilidad.
  if (env === 'SANDBOX') {
    console.log(`[revenuecat-webhook] SANDBOX event ${eventType} for ${userId}`)
  }

  try {
    switch (eventType) {
      // ── Activación / mantención del plan Pro ─────────────────────────────
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION': {
        const expiresAt = event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null
        await updateUserPlan(userId, 'pro', {
          plan_expires_at:        expiresAt,
          google_purchase_token:  event.transaction_id ?? null,
          google_subscription_id: event.product_id ?? null,
        })
        console.log(`[revenuecat-webhook] ${eventType} → pro, expires ${expiresAt}, user ${userId}`)
        break
      }

      // ── Cancelación: pierde renovación, pero todavía tiene acceso ────────
      // No degradamos a free — el access dura hasta expires_at. Pero refrescamos
      // el expires_at por si cambió.
      case 'CANCELLATION': {
        const expiresAt = event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null
        if (expiresAt) {
          await updateUserPlan(userId, 'pro', {
            plan_expires_at:        expiresAt,
            google_subscription_id: event.product_id ?? null,
          })
        }
        console.log(`[revenuecat-webhook] CANCELLATION → keeps pro until ${expiresAt}, user ${userId}`)
        break
      }

      // ── Pérdida real de acceso ───────────────────────────────────────────
      case 'EXPIRATION':
      case 'BILLING_ISSUE': {
        await updateUserPlan(userId, 'free', {
          plan_expires_at:        null,
          google_purchase_token:  null,
          google_subscription_id: null,
        })
        console.log(`[revenuecat-webhook] ${eventType} → free, user ${userId}`)
        break
      }

      // ── Otros eventos: log y skip ────────────────────────────────────────
      default:
        console.log(`[revenuecat-webhook] Ignored event type "${eventType}" for ${userId}`)
    }
  } catch (err) {
    console.error('[revenuecat-webhook] Error procesando evento:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  // RC reintenta si no respondemos 2xx — devolvemos OK siempre que parseamos.
  return NextResponse.json({ ok: true })
}
