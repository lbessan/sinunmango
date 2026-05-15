import { NextRequest, NextResponse } from 'next/server'
import { updateUserPlan } from '@/lib/subscription'

// ─── Tipos de notificación de Google Play ─────────────────────────────────────
// https://developer.android.com/google/play/billing/rtdn-reference
const NOTIF = {
  RECOVERED:              1,  // suscripción recuperada de account hold
  RENEWED:                2,  // renovada exitosamente
  CANCELED:               3,  // cancelada por el usuario (sigue activa hasta expiryTime)
  PURCHASED:              4,  // comprada por primera vez
  ON_HOLD:                5,  // pago fallido, en hold
  IN_GRACE_PERIOD:        6,  // pago fallido, en período de gracia
  RESTARTED:              7,  // reactivada desde cancelación
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED:               9,
  PAUSED:                 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED:                12, // revocada por reembolso
  EXPIRED:                13, // venció definitivamente
} as const

// ─── POST /api/webhooks/google-play ──────────────────────────────────────────
// Google Cloud Pub/Sub hace push a esta URL cuando hay un evento de suscripción.
// URL configurada en Play Console: https://tu-app.vercel.app/api/webhooks/google-play?token=PUBSUB_TOKEN
export async function POST(req: NextRequest) {

  // 1. Verificar token secreto (evita que alguien llame al endpoint sin ser Pub/Sub)
  const token = req.nextUrl.searchParams.get('token')
  if (token !== process.env.PUBSUB_VERIFICATION_TOKEN) {
    console.warn('[google-play] Token inválido:', token)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parsear el mensaje de Pub/Sub
  let body: { message?: { data?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawData = body?.message?.data
  if (!rawData) {
    // Pub/Sub a veces manda mensajes de prueba sin data — responder 200 para que no reintente
    return NextResponse.json({ ok: true })
  }

  // 3. Decodificar base64 → DeveloperNotification
  let notification: {
    packageName?: string
    subscriptionNotification?: {
      notificationType: number
      purchaseToken: string
      subscriptionId: string
    }
  }
  try {
    notification = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8'))
  } catch {
    console.error('[google-play] Error decodificando mensaje')
    return NextResponse.json({ ok: true }) // ack para no loop infinito
  }

  const notif = notification?.subscriptionNotification
  if (!notif) {
    // Puede ser un oneTimeProductNotification u otro tipo — ignorar
    return NextResponse.json({ ok: true })
  }

  const { notificationType, purchaseToken, subscriptionId } = notif
  console.log(`[google-play] Notificación tipo ${notificationType} | sub: ${subscriptionId}`)

  // 4. Consultar Google Play Developer API para obtener detalles de la compra
  const purchase = await getSubscriptionPurchase(
    process.env.GOOGLE_PLAY_PACKAGE_NAME!,
    subscriptionId,
    purchaseToken
  )

  if (!purchase) {
    console.error('[google-play] No se pudo obtener el purchase, tipo:', notificationType)
    // Si es EXPIRED o REVOKED igual actualizamos aunque no tengamos los detalles
    // Para los demás, retryable error
    if (notificationType !== NOTIF.EXPIRED && notificationType !== NOTIF.REVOKED) {
      return NextResponse.json({ error: 'Could not verify purchase' }, { status: 500 })
    }
  }

  // 5. El user ID lo enviamos desde la app como obfuscatedExternalAccountId al comprar
  const userId = purchase?.obfuscatedExternalAccountId
  if (!userId) {
    console.error('[google-play] Sin obfuscatedExternalAccountId en el purchase')
    return NextResponse.json({ ok: true }) // ack, no podemos hacer nada sin el user
  }

  // 6. Calcular fecha de expiración
  const expiryMs  = parseInt(purchase?.expiryTimeMillis ?? '0')
  const expiresAt = expiryMs ? new Date(expiryMs).toISOString() : null

  // 7. Actualizar plan según el tipo de notificación
  try {
    switch (notificationType) {
      // ── Activos: subir a pro ──────────────────────────────────────────
      case NOTIF.PURCHASED:
      case NOTIF.RENEWED:
      case NOTIF.RECOVERED:
      case NOTIF.RESTARTED:
      case NOTIF.IN_GRACE_PERIOD:  // pago en gracia: mantener acceso
        await updateUserPlan(userId, 'pro', {
          plan_expires_at:        expiresAt,
          google_purchase_token:  purchaseToken,
          google_subscription_id: subscriptionId,
        })
        console.log(`[google-play] Usuario ${userId} → pro (vence: ${expiresAt})`)
        break

      // ── Cancelado: sigue activo hasta expiresAt ───────────────────────
      case NOTIF.CANCELED:
        // No bajamos el plan todavía; cuando venga EXPIRED lo bajamos
        await updateUserPlan(userId, 'pro', {
          plan_expires_at:        expiresAt,
          google_purchase_token:  purchaseToken,
          google_subscription_id: subscriptionId,
        })
        console.log(`[google-play] Usuario ${userId} canceló — sigue activo hasta ${expiresAt}`)
        break

      // ── Inactivos: bajar a free ───────────────────────────────────────
      case NOTIF.EXPIRED:
      case NOTIF.REVOKED:
      case NOTIF.ON_HOLD:
        await updateUserPlan(userId, 'free', {
          plan_expires_at:        null,
          google_purchase_token:  purchaseToken,
          google_subscription_id: subscriptionId,
        })
        console.log(`[google-play] Usuario ${userId} → free (tipo: ${notificationType})`)
        break

      default:
        console.log(`[google-play] Tipo ignorado: ${notificationType}`)
    }
  } catch (err) {
    console.error('[google-play] Error actualizando plan:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ─── Google Play Developer API ────────────────────────────────────────────────

async function getSubscriptionPurchase(packageName: string, subscriptionId: string, purchaseToken: string) {
  try {
    const accessToken = await getGoogleAccessToken()
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error('[google-play] API error:', res.status, await res.text())
      return null
    }
    return res.json()
  } catch (err) {
    console.error('[google-play] getSubscriptionPurchase error:', err)
    return null
  }
}

// ─── Service Account JWT (sin dependencias externas) ─────────────────────────

async function getGoogleAccessToken(): Promise<string> {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss:   credentials.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }

  const jwt = await signRS256JWT(payload, credentials.private_key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    signal:  AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error(`[google-play] No access_token: ${JSON.stringify(data)}`)
  return data.access_token
}

async function signRS256JWT(payload: object, privateKey: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${b64url(header)}.${b64url(payload)}`

  const { createSign } = await import('crypto')
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(privateKey, 'base64url')

  return `${signingInput}.${signature}`
}
