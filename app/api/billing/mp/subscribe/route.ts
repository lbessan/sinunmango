import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'
import {
  createPreapproval,
  preapprovalCheckoutUrl,
  PRO_PRICE_ARS,
  EARLY_ACCESS_PRICE_ARS,
  EARLY_ACCESS_LIMIT,
  EARLY_ACCESS_DURATION_MONTHS,
  TRIAL_DAYS,
  MercadoPagoError,
} from '@/lib/mercadopago'

// ─── POST /api/billing/mp/subscribe ──────────────────────────────────────────
//
// Inicia el flow de suscripción Pro vía Mercado Pago.
//
// 1. Verifica que el user esté autenticado y no tenga ya un preapproval activo.
// 2. Decide si aplica early access (primeros 100 suscriptores → 50% off por
//    12 meses). El conteo lo hace contra `user_profiles.early_access = TRUE`.
// 3. Crea un preapproval en MP con start_date = NOW() + 7 días (trial gratis).
// 4. Guarda el preapproval_id + metadata en user_profiles (todavía status
//    'pending' — pasa a 'authorized' cuando llega el webhook).
// 5. Devuelve { init_point } para que el frontend redirija al checkout de MP.
//
// El user vuelve a /checkout/result después de autorizar (vía back_url
// configurado en el preapproval).

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 1. ¿Ya tenés un preapproval activo? ────────────────────────────────
  // Evita que el user cree dos suscripciones por accidente. Si su mp_status
  // es 'authorized' o 'pending', no le dejamos arrancar otro flow.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('mp_preapproval_id, mp_status, plan, email')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
  }

  if (profile.mp_status === 'authorized' || profile.mp_status === 'pending') {
    return NextResponse.json(
      {
        error: 'Ya tenés una suscripción activa o pendiente. Andá a Configuración → Suscripción si querés gestionarla.',
        current_status: profile.mp_status,
      },
      { status: 409 },
    )
  }

  // ── 2. ¿Aplica early access? ────────────────────────────────────────────
  // Cuento cuántos users ya tienen early_access TRUE. Si quedan slots, este
  // user también lo recibe. RACE CONDITION conocida: dos requests simultáneos
  // podrían pasar el chequeo y ambos quedar en early access. En la práctica
  // pasa muy poco (volumen bajo + ventana de carrera de ms). Si después
  // hace falta, usamos un advisory lock o una RPC con SELECT FOR UPDATE.
  // Usamos adminClient para bypass RLS (necesitamos contar across all users).
  const { count: earlyAccessUsed } = await adminClient
    .from('user_profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('early_access', true)

  const isEarlyAccess = (earlyAccessUsed ?? 0) < EARLY_ACCESS_LIMIT
  const priceArs       = isEarlyAccess ? EARLY_ACCESS_PRICE_ARS : PRO_PRICE_ARS

  // ── 3. Calcular fechas ─────────────────────────────────────────────────
  const now        = new Date()
  const trialEnd   = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

  // early_access_expires_at = subscribed_at + 12 meses. Si el user no es
  // early access, queda NULL (su suscripción sigue normal).
  const earlyAccessExpiresAt = isEarlyAccess
    ? (() => {
        const d = new Date(now)
        d.setMonth(d.getMonth() + EARLY_ACCESS_DURATION_MONTHS)
        return d.toISOString()
      })()
    : null

  // ── 4. Crear preapproval en MP ─────────────────────────────────────────
  let preapproval
  try {
    console.log(`[mp/subscribe] creando preapproval user=${user.id} email=${profile.email} amount=${priceArs} early=${isEarlyAccess} trialEnd=${trialEnd.toISOString()}`)
    preapproval = await createPreapproval({
      userId:            user.id,
      payerEmail:        profile.email,
      amountArs:         priceArs,
      reason:            isEarlyAccess
        ? 'sinunmango Pro · Early Access ($3.499/mes durante 12 meses)'
        : 'sinunmango Pro ($6.999/mes)',
      startDate:         trialEnd,
      externalReference: user.id,
    })
    console.log(`[mp/subscribe] preapproval creado id=${preapproval.id} status=${preapproval.status} init_point=${preapproval.init_point} sandbox_init=${preapproval.sandbox_init_point ?? 'N/A'}`)
  } catch (err) {
    if (err instanceof MercadoPagoError) {
      console.error('[mp/subscribe] MP error:', err.status, err.rawBody.slice(0, 1000))
      // Devolvemos el error de MP al frontend en sandbox para diagnosticar
      // más rápido. En prod sólo mensaje genérico.
      const isDev = process.env.MP_ACCESS_TOKEN?.startsWith('TEST-')
      return NextResponse.json(
        {
          error: 'No pudimos iniciar el cobro. Probá de nuevo en un momento.',
          ...(isDev ? { mp_status: err.status, mp_body: err.rawBody.slice(0, 1000) } : {}),
        },
        { status: 502 },
      )
    }
    console.error('[mp/subscribe] unexpected error:', err)
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }

  // ── 5. Guardar el preapproval en user_profiles ─────────────────────────
  // mp_status arranca en 'pending' — el webhook lo pasa a 'authorized'
  // cuando el user completa el flujo en MP. plan sigue siendo 'free' hasta
  // que el primer cobro real sea aprobado (también vía webhook).
  const { error: upErr } = await supabase
    .from('user_profiles')
    .update({
      mp_preapproval_id:       preapproval.id,
      mp_status:               'pending',
      plan_period:             'monthly',
      plan_amount:             priceArs,
      plan_renews_at:          trialEnd.toISOString(),
      subscribed_at:           now.toISOString(),
      early_access:            isEarlyAccess,
      early_access_expires_at: earlyAccessExpiresAt,
    })
    .eq('user_id', user.id)

  if (upErr) {
    console.error('[mp/subscribe] update profile error:', upErr)
    // No bloqueamos al user — el preapproval ya está en MP, le mandamos al
    // init_point igual. El webhook va a reconciliar con external_reference.
  }

  return NextResponse.json({
    ok:                  true,
    // preapprovalCheckoutUrl elige sandbox_init_point cuando el token es
    // TEST- y init_point cuando es prod. El frontend hace
    // window.location = init_point sin saber la diferencia.
    init_point:          preapprovalCheckoutUrl(preapproval),
    preapproval_id:      preapproval.id,
    early_access:        isEarlyAccess,
    plan_amount:         priceArs,
    trial_ends_at:       trialEnd.toISOString(),
  })
}
