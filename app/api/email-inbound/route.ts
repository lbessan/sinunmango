import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { calcularPeriodo, addMonths } from '@/lib/tarjeta-periodo'
import { todayAR } from '@/lib/timezone'
import { getUserPlanById } from '@/lib/subscription'
import { checkMonthlyUsageAsAdmin, enforceMonthlyLimitAsAdmin } from '@/lib/usage-limits'
import { isGmailVerificationEmail, extractGmailConfirmUrl } from '@/lib/gmail-verification'
import { MODEL_EMAIL_INBOUND } from '@/lib/claude-models'
import crypto from 'crypto'

// crypto.createHmac requiere runtime Node (no Edge)
export const runtime = 'nodejs'

// ─── Verificación de firma Svix (Resend usa Svix internamente) ───────────────
//
// Resend firma cada webhook con HMAC-SHA256 sobre `${id}.${timestamp}.${body}`
// usando un secret que el usuario configura en el dashboard de Resend.
// El secret viene en formato "whsec_<base64>".
//
// Sin esta verificación, cualquiera con la URL pública del webhook puede
// inyectar movimientos en cualquier cuenta cuyo token conozca o adivine.
function verifySvixSignature({ id, timestamp, signature, body, secret }: {
  id: string
  timestamp: string
  signature: string
  body: string
  secret: string
}): boolean {
  // Replay protection: descartar mensajes con timestamp fuera de ±5 min
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) return false
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > 5 * 60) {
    console.warn('[email-inbound] Svix timestamp outside ±5min tolerance')
    return false
  }

  // El secret se guarda como "whsec_<base64>"; el secret real es la parte después
  const secretMatch = secret.match(/^whsec_(.+)$/)
  if (!secretMatch) {
    console.error('[email-inbound] RESEND_WEBHOOK_SECRET formato inválido (esperado whsec_…)')
    return false
  }
  const secretBytes = Buffer.from(secretMatch[1], 'base64')

  // El payload firmado es {id}.{timestamp}.{body}
  const signedPayload = `${id}.${timestamp}.${body}`
  const expectedSig   = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64')

  // Header viene como "v1,sig1 v1,sig2 ..." — puede haber múltiples versiones
  const receivedSigs = signature.split(' ')
    .map(part => {
      const [version, sig] = part.split(',')
      return version === 'v1' ? sig : null
    })
    .filter((s): s is string => Boolean(s))

  if (receivedSigs.length === 0) return false

  // Comparación timing-safe (no leak por short-circuit)
  return receivedSigs.some(sig => {
    if (sig.length !== expectedSig.length) return false
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    } catch {
      return false
    }
  })
}

// ─── Strip HTML to plain text ────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/th>/gi, ' ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Fetch email body from Resend API ────────────────────────────────────────
async function fetchResendEmailBody(emailId: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return ''

  let res: Response
  try {
    res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal:  AbortSignal.timeout(10_000),
    })
  } catch (err) {
    console.warn(`[email-inbound] Could not fetch email ${emailId}:`, err)
    return ''
  }

  if (!res.ok) {
    console.warn(`[email-inbound] Could not fetch email ${emailId}: ${res.status}`)
    return ''
  }

  const data = await res.json()
  return data.text?.trim() || (data.html ? stripHtml(data.html) : '')
}

// ─── Delete inbound email from Resend (privacy) ──────────────────────────────
//
// Resend almacena el body de cada email entrante en su dashboard. Es data
// financiera sensible (notificaciones bancarias) que NO necesitamos
// retener una vez parseada. Borramos best-effort después de procesar:
//
//   1. Reduce la superficie de ataque si la cuenta de Resend se compromete.
//   2. Cumple "minimización de datos" (Habeas Data Art. 14 / GDPR Art. 5):
//      no guardar info más tiempo del necesario.
//   3. El admin (dev) no puede leer transactions del user con ojo desnudo
//      desde el dashboard de Resend.
//
// Es best-effort: si falla, loguemos pero NO devolvemos error al cron de
// Resend (sino reintenta el webhook y volvemos a procesar el mismo email).
// Idempotencia del lado del parser viene del UNIQUE constraint en
// movimientos.id + grupo_cuotas; un DELETE 404 simplemente significa
// "ya estaba borrado" o "no existe", ambos casos benignos.
async function deleteResendInboundEmail(emailId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !emailId) return

  // En sandbox/dev local NO borramos — el dev quiere ver los emails para
  // debuggear. Se controla via env var explícita.
  if (process.env.RESEND_KEEP_INBOUND === 'true') {
    console.log(`[email-inbound] RESEND_KEEP_INBOUND=true → skipping delete of ${emailId}`)
    return
  }

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal:  AbortSignal.timeout(10_000),
    })
    if (!res.ok && res.status !== 404) {
      // 404 = ya borrado, lo tratamos como éxito.
      const body = await res.text().catch(() => '')
      console.warn(`[email-inbound] Resend DELETE ${emailId} → ${res.status}: ${body.slice(0, 200)}`)
    } else {
      console.log(`[email-inbound] ✓ deleted email ${emailId} from Resend (${res.status})`)
    }
  } catch (err) {
    console.warn(`[email-inbound] Resend DELETE ${emailId} failed:`, err)
  }
}

// ─── Claude email parser ──────────────────────────────────────────────────────
type ParsedMov = {
  fecha:            string                 // ISO "2026-04-14"
  detalle:          string                 // Nombre del comercio o descripción
  monto:            number                 // Monto total (antes de dividir por cuotas)
  moneda:           'ARS' | 'USD'
  cuotas:           number                 // 1 si no es en cuotas
  terminacion:      string | null          // Últimos 4 dígitos de la cuenta/tarjeta
  tipo_movimiento:  'Gasto' | 'Ingreso'   // Gasto = débito/compra; Ingreso = reintegro/acreditación/cobro
}

async function parseEmailWithClaude(emailText: string): Promise<ParsedMov[]> {
  const today = todayAR()

  const prompt = `Sos un extractor de datos de emails de notificación bancaria argentina.
Analizá el siguiente email y extraé TODAS las transacciones financieras que encuentres.
Esto incluye tanto gastos/consumos COMO ingresos (reintegros, acreditaciones, cashback, bonificaciones, sueldos, cobros, devoluciones).

Hoy es ${today}. Si el email no contiene ninguna transacción (ej: email de bienvenida, marketing genérico, etc.), devolvé un array vacío.

Respondé ÚNICAMENTE con un JSON array, sin texto adicional, sin markdown, sin explicaciones.
Formato de cada elemento:
{
  "fecha": "YYYY-MM-DD",
  "detalle": "descripción clara de la transacción",
  "monto": 12345.67,
  "moneda": "ARS",
  "cuotas": 1,
  "terminacion": "1234",
  "tipo_movimiento": "Gasto"
}

Reglas para tipo_movimiento:
- "Gasto": compras, consumos, débitos, pagos realizados, extracciones
- "Ingreso": reintegros, cashback, acreditaciones, bonificaciones, devoluciones, sueldos cobrados

Otras reglas:
- "monto" es siempre POSITIVO, como número sin símbolos
- "cuotas" es 1 si no se menciona cuotas (los ingresos siempre tienen cuotas=1)
- "terminacion" son los últimos 4 dígitos de la tarjeta o cuenta bancaria si se mencionan, si no null
- Si hay múltiples transacciones en el email, incluí todas
- La fecha debe ser la fecha de la transacción, no la del email

Email:
${emailText.slice(0, 3000)}`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  AbortSignal.timeout(20_000),
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL_EMAIL_INBOUND,
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    console.error('[email-inbound] Claude fetch error:', err)
    return []
  }

  if (!res.ok) {
    console.error('[email-inbound] Claude API error:', res.status)
    return []
  }

  const data = await res.json()
  const raw  = (data.content?.[0]?.text ?? '').trim()

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0]) as ParsedMov[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.error('[email-inbound] Claude response parse error:', raw.slice(0, 200))
    return []
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Leemos el body como STRING raw para poder verificar la firma del webhook.
  // El JSON.parse va después porque la firma se calcula sobre los bytes exactos.
  const rawBody = await req.text()

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Detect Resend Inbound webhook format ─────────────────────────────────
  // Resend envía el email directo como { object: 'email', id, from, to, text, ... }
  const isResend = body.object === 'email'
    || body.type === 'email.received'
    || (typeof body.data === 'object' && body.data !== null && ('email_id' in (body.data as object) || 'id' in (body.data as object)))

  // ── Verificar firma Svix (solo para webhooks tipo Resend) ────────────────
  if (isResend) {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      // Sin secret no podemos verificar el origen del webhook → cualquiera
      // con la URL pública podría inyectar movimientos en cuentas ajenas.
      // 503 explícito: el endpoint está deshabilitado hasta configurar el secret.
      console.error('[email-inbound] RESEND_WEBHOOK_SECRET no configurado — endpoint deshabilitado')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const svixId        = req.headers.get('svix-id')
    const svixTimestamp = req.headers.get('svix-timestamp')
    const svixSignature = req.headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn('[email-inbound] Faltan headers de Svix (svix-id/timestamp/signature)')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const valid = verifySvixSignature({
      id:        svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
      body:      rawBody,
      secret,
    })

    if (!valid) {
      console.warn('[email-inbound] Firma Svix inválida')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let emailText = ''
  let userId: string | null = null
  // emailId queda en outer scope para que el delete-on-success funcione
  // después del bloque if(isResend). En el legacy path queda null y los
  // deletes son no-op.
  let resendEmailId: string | null = null

  if (isResend) {
    const data = (typeof body.data === 'object' && body.data !== null)
      ? body.data as Record<string, unknown>
      : body

    // Resend puede usar 'email_id' o 'id' según la versión del webhook
    const emailId = (data.email_id ?? data.id) as string | undefined
    // Lo guardamos al outer scope para que los exit points POST-isResend
    // (limit, no transactions, success) puedan borrar el email también.
    if (emailId) resendEmailId = emailId
    const toField = data.to
    const toList: string[] = Array.isArray(toField)
      ? toField as string[]
      : typeof toField === 'string' ? [toField] : []

    // Extraer token del address destino
    const DOMAIN = process.env.EMAIL_INBOUND_DOMAIN ?? 'sinunmango.com.ar'
    const toAddr = toList.find(a => a.toLowerCase().endsWith(`@${DOMAIN}`)) ?? toList[0] ?? ''
    const token  = toAddr.split('@')[0].toLowerCase()

    if (!token) {
      if (emailId) await deleteResendInboundEmail(emailId)
      return NextResponse.json({ ok: false, skipped: true, reason: 'no matching to address' })
    }

    // Buscar usuario por token
    const { data: pref } = await adminClient
      .from('user_preferences')
      .select('user_id')
      .eq('email_inbound_token', token)
      .maybeSingle()

    if (!pref) {
      console.warn(`[email-inbound] Unknown inbound token: ${token}`)
      if (emailId) await deleteResendInboundEmail(emailId)
      return NextResponse.json({ ok: false, skipped: true, reason: 'unknown token' })
    }

    userId = pref.user_id as string

    // Obtener texto del email
    const inlineText = (data.text as string | undefined)?.trim()
    const inlineHtml = (data.html as string | undefined)?.trim()

    if (inlineText) {
      emailText = inlineText
    } else if (inlineHtml) {
      emailText = stripHtml(inlineHtml)
    } else if (emailId) {
      emailText = await fetchResendEmailBody(emailId)
    }

    console.log(`[email-inbound] emailId=${emailId} textLen=${emailText.length} hasInlineText=${!!inlineText} hasInlineHtml=${!!inlineHtml}`)

    // ── Confirmación automática de filtro Gmail ───────────────────────────
    const subject  = (data.subject as string | undefined) ?? ''
    const fromAddr = (data.from as string | undefined) ?? ''
    // Detectar por subject/from O por presencia directa de la URL en el body
    const looksLikeGmailVerification = isGmailVerificationEmail(subject, fromAddr)
      || emailText.includes('mail-settings.google.com/mail/vf-')
      || emailText.includes('mail.google.com/mail/vf-')
    console.log(`[email-inbound] subject="${subject}" from="${fromAddr}" gmailCheck=${looksLikeGmailVerification}`)
    if (looksLikeGmailVerification) {
      const confirmUrl = extractGmailConfirmUrl(emailText)
      console.log(`[email-inbound] Gmail confirm URL: ${confirmUrl?.slice(0, 60) ?? 'NOT FOUND'}`)
      if (confirmUrl && userId) {
        // Guardar la URL — el usuario tiene que abrirla en su browser (requiere sesión Google)
        await adminClient
          .from('user_preferences')
          .upsert(
            {
              user_id:                 userId,
              gmail_verification_code: confirmUrl,
              updated_at:              new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )

        console.log(`[email-inbound] Gmail confirm URL saved for user ${userId}`)
        // Email procesado (URL guardada) → borrar de Resend (no necesitamos
        // retener el body — la URL ya está en user_preferences)
        if (emailId) await deleteResendInboundEmail(emailId)
        return NextResponse.json({ ok: true, type: 'gmail_verification', autoConfirmed: false })
      }
      // Email de verificación sin URL reconocible — ignorar silenciosamente
      if (emailId) await deleteResendInboundEmail(emailId)
      return NextResponse.json({ ok: false, skipped: true, reason: 'gmail verification email, no confirm url found' })
    }

  } else {
    // Legacy: { texto, from, subject } con Bearer auth
    const secret = process.env.EMAIL_INBOUND_SECRET
    if (secret) {
      const auth = req.headers.get('authorization')
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    emailText = (body.texto as string | undefined)?.trim() ?? ''
  }

  if (!emailText) {
    if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
    return NextResponse.json({ ok: false, skipped: true, reason: 'empty body' })
  }

  // ── Gate de plan: no llamamos a Claude sin saber a qué user atribuir ──────
  // Free tier: 1 mail parseado/mes. Pro: ilimitado. Si no hay userId
  // (token desconocido o user eliminado), no procesamos para evitar abuso.
  if (!userId) {
    if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
    return NextResponse.json({ ok: false, skipped: true, reason: 'no userId for token' })
  }
  const plan = await getUserPlanById(adminClient, userId)

  // ── CHECK (no consume): rechazamos antes de llamar a Claude si el user ya
  //    agotó su cupo del mes ──
  const check = await checkMonthlyUsageAsAdmin(adminClient, userId, 'mail_tarjeta', plan.has_pro_access)
  if (!check.allowed) {
    console.log(`[email-inbound] limit_reached user=${userId} feature=mail_tarjeta`)
    // Borramos igual — no vamos a procesar este email, no hay motivo para
    // retenerlo en Resend.
    if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
    return NextResponse.json({ ok: false, skipped: true, reason: 'free_tier_limit_reached', limit: check.limit })
  }

  // ── Parsear con Claude ────────────────────────────────────────────────────
  const parsedList = await parseEmailWithClaude(emailText)
  if (parsedList.length === 0) {
    // No consumimos cupo: el mail no tenía transacciones reconocibles.
    // Tampoco hay razón para retener el body (no es accionable).
    if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
    return NextResponse.json({ ok: false, skipped: true, reason: 'no transactions found' })
  }

  // ── COMMIT (atomic): incrementamos cupo ahora que sabemos que vale la pena.
  //    En la pequeña ventana de race entre check y commit otra invocación
  //    pudo haber consumido el último cupo del user → la RPC nos rechaza acá ──
  const committed = await enforceMonthlyLimitAsAdmin(adminClient, userId, 'mail_tarjeta', plan.has_pro_access)
  if (!committed.allowed) {
    console.log(`[email-inbound] limit_reached_after_parse user=${userId} feature=mail_tarjeta`)
    if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
    return NextResponse.json({ ok: false, skipped: true, reason: 'free_tier_limit_reached_after_parse', limit: committed.limit })
  }

  // ── Cargar cuentas del usuario ────────────────────────────────────────────
  let cuentasQuery = adminClient
    .from('cuentas')
    .select('id, user_id, nombre_cuenta, tipo_cuenta, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta, terminacion_tarjeta')
    .eq('activa', true)

  if (userId) cuentasQuery = cuentasQuery.eq('user_id', userId)

  const { data: cuentas } = await cuentasQuery

  // ── Procesar cada transacción ─────────────────────────────────────────────
  const allRecords: object[] = []
  const importados:  string[] = []
  const noMapeados:  string[] = []

  for (const parsed of parsedList) {
    // Buscar cuenta por terminación (tarjeta o cuenta bancaria)
    const cuenta = cuentas?.find(c => {
      if (!parsed.terminacion) return false
      return String(c.terminacion_tarjeta) === String(parsed.terminacion)
    })

    if (!cuenta) {
      console.warn(`[email-inbound] No cuenta for terminacion=${parsed.terminacion} (${parsed.detalle})`)
      noMapeados.push(`terminacion ${parsed.terminacion}`)
      continue
    }

    const isTarjeta   = cuenta.tipo_cuenta === 'Tarjeta Credito'
    const isIngreso   = parsed.tipo_movimiento === 'Ingreso'
    const cierreDay   = cuenta.fecha_cierre_tarjeta
      ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
    const venceDay    = cuenta.fecha_vencimiento_tarjeta
      ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null

    // Logging defensivo para diagnosticar el bug del período mal asignado.
    // Cuando volvamos a ver una asignación incorrecta, este log va a tener
    // todo el contexto (fechas, días, moneda, flags) sin tener que reproducir.
    console.log(
      `[email-inbound/period-debug] cuenta=${cuenta.nombre_cuenta} ` +
      `tipo=${cuenta.tipo_cuenta} ` +
      `cierre_raw=${cuenta.fecha_cierre_tarjeta} cierreDay=${cierreDay} ` +
      `vence_raw=${cuenta.fecha_vencimiento_tarjeta} venceDay=${venceDay} ` +
      `parsed_fecha=${parsed.fecha} parsed_moneda=${parsed.moneda} ` +
      `parsed_detalle="${parsed.detalle}" parsed_monto=${parsed.monto} ` +
      `isTarjeta=${isTarjeta} isIngreso=${isIngreso} ` +
      `aplica_diferimiento=${isTarjeta && !isIngreso && parsed.moneda !== 'USD'}`
    )

    // Los ingresos no se dividen en cuotas
    const cuotasEfectivas = isIngreso ? 1 : parsed.cuotas
    const montoCuota      = parsed.monto / cuotasEfectivas
    // Si hay más de una cuota, todas comparten un grupo_cuotas
    const grupoCuotas     = cuotasEfectivas > 1 ? crypto.randomUUID() : null

    const records = Array.from({ length: cuotasEfectivas }, (_, i) => {
      const fechaCuota   = addMonths(parsed.fecha, i)
      // El periodo de tarjeta aplica solo a gastos con tarjeta
      const periodoCuota = calcularPeriodo(
        fechaCuota, cierreDay, venceDay,
        isTarjeta && !isIngreso && parsed.moneda !== 'USD'
      )

      // Log por cuota (uno por movimiento creado) — el período calculado
      // es el dato clave a comparar contra lo que muestra el form al editar.
      if (i === 0) {
        console.log(
          `[email-inbound/period-result] fechaCuota=${fechaCuota} ` +
          `periodoCuota=${periodoCuota} (cuotas_total=${cuotasEfectivas})`
        )
      }
      return {
        id:              crypto.randomUUID(),
        fecha:           fechaCuota,
        detalle:         cuotasEfectivas > 1
          ? `${parsed.detalle} (Cuota ${i + 1}/${cuotasEfectivas})`
          : parsed.detalle,
        monto:           montoCuota,
        moneda:          parsed.moneda,
        tipo_movimiento: parsed.tipo_movimiento,
        cuenta_origen:   cuenta.id,
        cuenta_destino:  null,
        categoria:       null,
        subcategoria:    null,
        cotizacion:      null,
        conciliado:      false,
        periodo_tarjeta: periodoCuota,
        cuotas_total:    cuotasEfectivas,
        cuota_actual:    i + 1,
        ciclo_actual:    1,
        grupo_cuotas:    grupoCuotas,
        user_id:         cuenta.user_id,
      }
    })

    allRecords.push(...records)
    importados.push(`${parsed.detalle} $${parsed.monto} → ${cuenta.nombre_cuenta}`)
  }

  if (allRecords.length === 0) {
    // Mail con transactions parseadas pero ninguna cuenta del user matcheó
    // las terminaciones. El user posiblemente no configuró las tarjetas
    // todavía. Lo borramos: si el user vuelve a forward la misma noti, va
    // a tener efecto cuando configure la cuenta.
    if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
    return NextResponse.json({
      ok:      false,
      skipped: true,
      reason:  `No cuenta configured for: ${noMapeados.join(', ')}`,
    })
  }

  // ── Insertar ──────────────────────────────────────────────────────────────
  const { error } = await adminClient.from('movimientos').insert(allRecords as never)
  if (error) {
    console.error('[email-inbound] Insert error:', error.message)
    // Insert error es el ÚNICO caso donde NO borramos — dejamos el email
    // en Resend para que el dev pueda diagnosticar qué salió mal (FK,
    // constraint, etc). Si el user ve el mismo error repetido, hay un bug
    // que se va a notar y se puede reproducir.
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`[email-inbound] ✓ Imported ${allRecords.length} record(s): ${importados.join(' | ')}`)
  // Éxito: los movimientos quedaron en Supabase, borramos el email original.
  if (resendEmailId) await deleteResendInboundEmail(resendEmailId)
  return NextResponse.json({
    ok:         true,
    importados: importados.length,
    detalle:    importados[0] ?? '',
    monto:      parsedList[0]?.monto ?? 0,
    cuotas:     parsedList[0]?.cuotas ?? 1,
    cuenta:     importados[0]?.split(' → ')[1] ?? '',
  })
}
