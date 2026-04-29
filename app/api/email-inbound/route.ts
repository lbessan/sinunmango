import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

// ─── Period + date helpers ────────────────────────────────────────────────────
function calcularPeriodo(
  fechaStr: string,
  cierreDay: number | null,
  venceDay:  number | null,
  isTarjeta: boolean
): string {
  const d    = new Date(fechaStr + 'T12:00:00')
  let mes    = d.getMonth()
  let anio   = d.getFullYear()
  if (isTarjeta && cierreDay && venceDay) {
    const day = d.getDate()
    if (day <= cierreDay) {
      if (venceDay <= cierreDay) mes += 1
    } else {
      if (venceDay > cierreDay) mes += 1
      else                       mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function addMeses(fechaStr: string, n: number): string {
  const d = new Date(fechaStr + 'T12:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
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
  const m = text.match(/https:\/\/mail-settings\.google\.com\/mail\/vf-[^\s<>"'\]]+/)
  return m ? m[0] : null
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

  const body = await req.json() as Record<string, unknown>

  // ── Detect Resend Inbound webhook format ─────────────────────────────────
  const isResend = body.type === 'email.received'
    || (typeof body.data === 'object' && body.data !== null && 'email_id' in (body.data as object))

  let emailText = ''
  let userId: string | null = null

  if (isResend) {
    const data = (typeof body.data === 'object' && body.data !== null)
      ? body.data as Record<string, unknown>
      : body

    const emailId = data.email_id as string | undefined
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

    // ── Confirmación automática de filtro Gmail ───────────────────────────
    const subject  = (data.subject as string | undefined) ?? ''
    const fromAddr = (data.from as string | undefined) ?? ''
    if (isGmailVerificationEmail(subject, fromAddr)) {
      const confirmUrl = extractGmailConfirmUrl(emailText)
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

    const records = Array.from({ length: cuotasEfectivas }, (_, i) => {
      const fechaCuota   = addMeses(parsed.fecha, i)
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
  const { error } = await adminClient.from('movimientos').insert(allRecords)
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
