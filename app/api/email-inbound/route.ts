import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { calcularPeriodo, addMonths } from '@/lib/tarjeta-periodo'
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

// ─── Gmail forwarding verification detector ───────────────────────────────────
function isGmailVerificationEmail(subject: string, from: string): boolean {
  const s = subject.toLowerCase()
  const f = from.toLowerCase()
  return (
    f.includes('forwarding-noreply@google.com') ||
    f.includes('mail-settings.google.com') ||
    s.includes('forwarding confirmation') ||
    s.includes('confirmación de reenvío') ||
    s.includes('confirmacion de reenvio') ||
    s.includes('gmail forwarding') ||
    (s.includes('reenviar') && s.includes('gmail')) ||
    (s.includes('confirmaci') && s.includes('gmail'))
  )
}

/** Extrae la URL de confirmación de reenvío de Gmail del cuerpo del email */
function extractGmailConfirmUrl(text: string): string | null {
  // Gmail usa mail.google.com o mail-settings.google.com según el idioma/región
  const m = text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/vf-[^\s<>"]+/)
  if (!m) return null
  // Limpiar posible puntuación trailing
  return m[0].replace(/[.,;)>\]'"]+$/, '')
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

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    console.warn(`[email-inbound] Could not fetch email ${emailId}: ${res.status}`)
    return ''
  }

  const data = await res.json()
  return data.text?.trim() || (data.html ? stripHtml(data.html) : '')
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
  const today = new Date().toISOString().slice(0, 10)

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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

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
    if (secret) {
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
    } else {
      // Fallback: secret no configurado todavía. Loggear pero no romper para
      // permitir despliegue gradual (configurás el secret en Resend + Vercel sin
      // downtime del webhook). Quitar este else cuando el secret esté en prod.
      console.warn('[email-inbound] RESEND_WEBHOOK_SECRET no configurado — webhook procesado SIN verificar firma')
    }
  }

  let emailText = ''
  let userId: string | null = null

  if (isResend) {
    const data = (typeof body.data === 'object' && body.data !== null)
      ? body.data as Record<string, unknown>
      : body

    // Resend puede usar 'email_id' o 'id' según la versión del webhook
    const emailId = (data.email_id ?? data.id) as string | undefined
    const toField = data.to
    const toList: string[] = Array.isArray(toField)
      ? toField as string[]
      : typeof toField === 'string' ? [toField] : []

    // Extraer token del address destino
    const DOMAIN = process.env.EMAIL_INBOUND_DOMAIN ?? 'sinunmango.com.ar'
    const toAddr = toList.find(a => a.toLowerCase().endsWith(`@${DOMAIN}`)) ?? toList[0] ?? ''
    const token  = toAddr.split('@')[0].toLowerCase()

    if (!token) {
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
        return NextResponse.json({ ok: true, type: 'gmail_verification', autoConfirmed: false })
      }
      // Email de verificación sin URL reconocible — ignorar silenciosamente
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
    return NextResponse.json({ ok: false, skipped: true, reason: 'empty body' })
  }

  // ── Parsear con Claude ────────────────────────────────────────────────────
  const parsedList = await parseEmailWithClaude(emailText)
  if (parsedList.length === 0) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'no transactions found' })
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`[email-inbound] ✓ Imported ${allRecords.length} record(s): ${importados.join(' | ')}`)
  return NextResponse.json({
    ok:         true,
    importados: importados.length,
    detalle:    importados[0] ?? '',
    monto:      parsedList[0]?.monto ?? 0,
    cuotas:     parsedList[0]?.cuotas ?? 1,
    cuenta:     importados[0]?.split(' → ')[1] ?? '',
  })
}
