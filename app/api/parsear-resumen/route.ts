import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserPlan } from '@/lib/subscription'
import { checkMonthlyLimit, commitMonthlyUsage, isOnboardingActive, usageHeaders } from '@/lib/usage-limits'
import { parseClaudeJSON, recoverPartialArray } from '@/lib/parse-claude-json'
import { MODEL_PARSEAR_RESUMEN } from '@/lib/claude-models'
import { isPdfEncrypted, extractTextFromPdf } from '@/lib/pdf-decrypt'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024  // ~3.75 MB binario. PDFs típicos < 2 MB.
// Timeout del fetch a Claude. Antes era 55s (limit de Hobby).
// Ahora estamos en Vercel Pro (Fluid Compute) con maxDuration=300s.
// Con resúmenes que incluyen adicionales (más transacciones + más campos
// por tx) Claude puede tardar 60-120s. Dejamos 240s para dar margen.
const CLAUDE_TIMEOUT_MS    = 240_000

// Le pedimos a Next/Vercel que esta función puede tardar hasta 5 min.
// Sin esto, Fluid Compute usa el default que en algunos planes corta antes.
export const maxDuration = 300

// ─── POST /api/parsear-resumen ────────────────────────────────────────────────
// Recibe un PDF de resumen de tarjeta (base64), lo procesa con Claude y
// devuelve las transacciones encontradas para que el usuario las confirme.
//
// Body: { pdf: string (base64), movimientosExistentes: { detalle, monto, fecha }[] }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Rate limit por minuto — PDFs son llamadas caras (max_tokens 16k).
  const rl = await checkRateLimit(user.id, '/api/parsear-resumen', { max: 3, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // Monthly usage gate (free tier): 1 resumen/mes. Pro: ilimitado.
  // CHECK sin incrementar — solo consumimos cupo si la operación resulta exitosa.
  // Durante el onboarding, el contador no aplica (ver isOnboardingActive).
  const plan         = await getUserPlan(supabase)
  const inOnboarding = await isOnboardingActive(supabase, user.id)
  const usage        = inOnboarding
    ? null
    : await checkMonthlyLimit(supabase, 'resumen', plan.has_pro_access)
  if (usage && !usage.allowed) {
    return NextResponse.json(
      { error: 'limit_reached', feature: 'resumen', limit: usage.limit, used: usage.used },
      { status: 429 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada.' },
      { status: 503 }
    )
  }

  const { pdf, movimientosExistentes = [], cuenta_id, resumen_password, save_password } = (await req.json()) as {
    pdf: string
    movimientosExistentes: { detalle: string | null; monto: number; fecha: string }[]
    /** Opcional. Si viene, intentamos detectar próximas fechas de cierre/venc
     *  del resumen y devolverlas para que el client confirme la actualización
     *  de la cuenta. Si no viene, ignoramos esa parte (compat con flows que
     *  llaman sin contexto de cuenta). */
    cuenta_id?: string
    /** Opcional. Password del PDF que mandó el user en el retry tras
     *  recibir `requires_password`. Si no viene, intentamos leer la
     *  guardada en cuenta.resumen_password_cipher (si cuenta_id). */
    resumen_password?: string
    /** Si true + descifrado OK + cuenta_id, persistimos la password
     *  (encriptada) en cuenta.resumen_password_cipher para próximos
     *  resúmenes. Si no, descartamos tras procesar. */
    save_password?: boolean
  }

  if (!pdf) return NextResponse.json({ error: 'No se recibió el PDF.' }, { status: 400 })
  if (pdf.length > MAX_PDF_BASE64_BYTES) {
    return NextResponse.json(
      { error: `El PDF supera el máximo de ${MAX_PDF_BASE64_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  // ── PDF encriptado: descifrar acá antes de mandar a Claude ─────────────
  // Estados que devolvemos al cliente:
  //   - requires_password: el PDF está protegido y no tenemos password
  //   - wrong_password:    probamos una password y no descifró
  //   - decrypt_failed:    error genérico de la lib (PDF corrupto, etc)
  // Si descifra OK, mandamos el TEXTO a Claude en vez del PDF binary.
  const pdfBuffer = Buffer.from(pdf, 'base64')
  let extractedText: string | null = null   // si !== null, mandar texto en vez de PDF

  if (isPdfEncrypted(pdfBuffer)) {
    // 1) Determinar qué password probar: el del body (retry del user) o
    //    la guardada en la cuenta.
    let passwordToTry = typeof resumen_password === 'string' && resumen_password.length > 0
      ? resumen_password
      : null

    if (!passwordToTry && cuenta_id) {
      const { data: row } = await supabase
        .from('cuentas')
        .select('resumen_password_cipher')
        .eq('id', cuenta_id)
        .eq('user_id', user.id)
        .maybeSingle()
      const cipher = (row as unknown as { resumen_password_cipher?: string | null } | null)?.resumen_password_cipher
      if (cipher) {
        passwordToTry = decryptSecret(cipher)
      }
    }

    if (!passwordToTry) {
      return NextResponse.json(
        { error: 'requires_password', code: 'requires_password' },
        { status: 422 },
      )
    }

    const result = await extractTextFromPdf(pdfBuffer, passwordToTry)
    if (!result.ok) {
      if (result.error === 'wrong_password') {
        return NextResponse.json(
          { error: 'wrong_password', code: 'wrong_password' },
          { status: 422 },
        )
      }
      if (result.error === 'requires_password') {
        // Edge case: pdf.js reportó requires_password aún con password
        return NextResponse.json(
          { error: 'requires_password', code: 'requires_password' },
          { status: 422 },
        )
      }
      console.error('[parsear-resumen] decrypt unknown error:', result.message)
      return NextResponse.json(
        { error: 'decrypt_failed', code: 'decrypt_failed', message: result.message },
        { status: 422 },
      )
    }

    extractedText = result.text

    // Guardar la password si el user lo pidió y descifró OK.
    if (save_password && cuenta_id) {
      try {
        const cipher = encryptSecret(passwordToTry)
        await supabase
          .from('cuentas')
          .update({ resumen_password_cipher: cipher } as never)
          .eq('id', cuenta_id)
          .eq('user_id', user.id)
      } catch (err) {
        console.error('[parsear-resumen] save_password failed:', err)
        // No bloqueamos el flow — la password sirvió para esta vez.
      }
    }
  }

  const movsResumen = movimientosExistentes.length > 0
    ? `\nMovimientos ya cargados en el sistema (para comparar y NO duplicar):\n${
        movimientosExistentes.map(m =>
          `- ${m.fecha} | ${m.detalle ?? '(sin detalle)'} | $${m.monto}`
        ).join('\n')
      }\n`
    : ''

  let claudeRes: Response
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model:      MODEL_PARSEAR_RESUMEN,
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            // Si el PDF era encriptado y descifrado, mandamos TEXTO ya
            // extraído (pdf.js). Sino, mandamos el PDF binary y dejamos
            // que Claude lo procese visualmente (mejor para layouts
            // complejos). El prompt en sí no cambia.
            ...(extractedText !== null
              ? [{
                  type: 'text' as const,
                  text: `Te paso el TEXTO ya extraído de un resumen de tarjeta de crédito (el PDF estaba protegido por password). El layout puede haberse perdido pero el contenido está completo:\n\n${extractedText}\n\n--- FIN DEL TEXTO DEL PDF ---\n`,
                }]
              : [{
                  type: 'document' as const,
                  source: {
                    type:       'base64' as const,
                    media_type: 'application/pdf' as const,
                    data:       pdf,
                  },
                }]),
            {
              type: 'text',
              text: `Analizá este resumen de tarjeta de crédito y extraé los siguientes items:

1. CONSUMOS del titular principal Y DE TODAS LAS TARJETAS ADICIONALES. El resumen normalmente tiene secciones separadas tipo "Consumos de [Nombre Titular]" o "Consumos [Nombre Adicional]". Incluí TODOS, identificando el titular de cada uno con el campo "titular".
2. DESCUENTOS Y CRÉDITOS A FAVOR que aparezcan EN CUALQUIER PARTE del resumen (incluso fuera de la sección de consumos, en el encabezado o en secciones propias). Ejemplos: "CR.RG ...", "BONIF. CONSUMO ...", "REINTEGRO ...", "DESCUENTO ...", ajustes con monto negativo.
3. TODOS los items INDIVIDUALES de la sección "Impuestos, cargos e intereses" (si existe), cada uno por separado
4. FECHAS DEL PRÓXIMO PERÍODO si figuran en el resumen (típicamente en el encabezado o pie):
   - proximo_cierre: fecha del próximo cierre del resumen (YYYY-MM-DD). Buscá frases como "Próximo cierre", "Próximo resumen cierra el", "Cierre próximo", etc.
   - proximo_vencimiento: fecha del próximo vencimiento de pago (YYYY-MM-DD). Buscá "Próximo vencimiento", "Vence el", "Pague hasta el". OJO: tiene que ser una fecha FUTURA al cierre.
   Si no figuran explícitamente, devolvé null en ambos campos. NO infieras ni calcules.
${movsResumen}
Para cada item extraé:
- fecha (formato YYYY-MM-DD)
- detalle (descripción limpia, sin códigos internos ni número de cupón)
- monto_ars (monto en pesos como número positivo. Si es en dólares, poné null)
- monto_usd (monto en dólares como número positivo. Si es en pesos, poné null)
- cuotas (número de cuota actual si dice "C.XX/YY", sino 1)
- cuotas_total (total de cuotas si dice "C.XX/YY", sino 1)
- ya_existe (true si coincide con alguno de los movimientos ya cargados por fecha y monto similar)
- es_impuesto (true para CADA item de la sección impuestos/cargos/intereses, individualmente)
- es_descuento (true para bonificaciones, reintegros, descuentos y créditos a favor — siempre monto POSITIVO)
- titular (string con el NOMBRE DEL TITULAR exacto tal como figura en el resumen en el header de la sección donde está el consumo — ej: "Celeste Cerono", "L Bessan Nofal". Si el consumo es del titular principal y no hay subsección, o si es un descuento/impuesto general sin titular asociado, devolvé null. Es el dato que usamos para dispatchar consumos a la tarjeta adicional correcta.)

Para los impuestos: listá CADA LÍNEA individualmente (no las sumes). Si el PDF tiene varias páginas, asegurate de incluir todos los items de impuestos de todas las páginas. Cada item va con es_impuesto: true.
Para descuentos: incluílos individualmente con monto POSITIVO y es_descuento: true. Buscalos en TODO el documento, no solo en la sección de consumos.

Devolvé ÚNICAMENTE un JSON válido con este formato exacto, sin markdown ni texto adicional:
{
  "proximo_cierre": "2026-06-23",
  "proximo_vencimiento": "2026-07-10",
  "transacciones": [
    {
      "fecha": "2026-04-14",
      "detalle": "Netflix",
      "monto_ars": null,
      "monto_usd": 5.00,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": false,
      "es_descuento": false,
      "titular": "L Bessan Nofal"
    },
    {
      "fecha": "2026-04-05",
      "detalle": "Market",
      "monto_ars": 46261.86,
      "monto_usd": null,
      "cuotas": 2,
      "cuotas_total": 3,
      "ya_existe": false,
      "es_impuesto": false,
      "es_descuento": false,
      "titular": "Celeste Cerono"
    },
    {
      "fecha": "2026-04-01",
      "detalle": "CR.RG 5617 30% M",
      "monto_ars": 42434.75,
      "monto_usd": null,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": false,
      "es_descuento": true,
      "titular": null
    },
    {
      "fecha": "2026-04-23",
      "detalle": "Impuesto de Sellos",
      "monto_ars": 19351.77,
      "monto_usd": null,
      "cuotas": 1,
      "cuotas_total": 1,
      "ya_existe": false,
      "es_impuesto": true,
      "es_descuento": false,
      "titular": null
    }
  ]
}

Notas importantes:
- Ignorá SOLO los pagos realizados (sección "Pagos" del resumen)
- SÍ incluí descuentos y créditos a favor aunque estén fuera de la sección de consumos
- INCLUÍ consumos del titular principal Y de tarjetas adicionales — identificando cada uno con su titular en el campo correspondiente
- Para cuotas: si dice "C.04/12" significa cuota 4 de 12 — extraé SOLO esa cuota tal cual aparece
- Limpiá el detalle: "CARREFOUR MAR DEL PLATA" → "Carrefour Mar del Plata". NUNCA uses markdown (no links, no asteriscos, solo texto plano)
- Si no hay sección de impuestos/cargos, no incluyas ningún item con es_impuesto: true
- Los montos siempre van como número POSITIVO — es_descuento: true indica que es un crédito a favor
- IMPORTANTE: si el documento tiene múltiples páginas, revisá TODAS las páginas para impuestos y descuentos`,
            },
          ],
        },
      ],
    }),
  })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[parsear-resumen] Claude timeout')
      return NextResponse.json({ error: 'El PDF tardó demasiado en procesarse. Probá con un archivo más chico.' }, { status: 504 })
    }
    console.error('[parsear-resumen] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio de IA.' }, { status: 502 })
  }

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    console.error('[parsear-resumen] Claude API error:', err)
    return NextResponse.json({ error: 'Error al procesar el PDF con IA.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText    = claudeData.content?.[0]?.text ?? ''

  // ── Helper: si vino cuenta_id, calcular fechas_propuestas comparando con la
  //   cuenta actual. Solo devolvemos algo si las fechas son válidas (futuras,
  //   coherentes) Y distintas de las actuales. Si Claude no las extrajo o son
  //   inválidas, devolvemos null (= no proponer cambio).
  async function buildFechasPropuestas(
    proxCierreRaw: unknown,
    proxVencRaw:   unknown,
  ): Promise<{
    proximo_cierre:        string
    proximo_vencimiento:   string
    actual_cierre:         string | null
    actual_vencimiento:    string | null
  } | null> {
    if (!cuenta_id) return null
    if (typeof proxCierreRaw !== 'string' && typeof proxVencRaw !== 'string') return null

    // Validar formato ISO y que sean fechas futuras razonables (próximos 60 días)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const limit = new Date(); limit.setDate(limit.getDate() + 90)
    const isValid = (s: unknown): s is string => {
      if (typeof s !== 'string') return false
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
      const d = new Date(s + 'T12:00:00')
      return !Number.isNaN(d.getTime()) && d >= today && d <= limit
    }

    if (!isValid(proxCierreRaw) || !isValid(proxVencRaw)) return null

    // El vencimiento debe ser posterior al cierre (sanity)
    if (new Date(proxVencRaw + 'T12:00:00') <= new Date(proxCierreRaw + 'T12:00:00')) return null

    // Leer la cuenta actual para comparar
    const { data: cuentaActual } = await supabase
      .from('cuentas')
      .select('id, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta, tipo_cuenta, user_id')
      .eq('id', cuenta_id)
      .eq('user_id', user!.id)
      .maybeSingle()

    if (!cuentaActual || cuentaActual.tipo_cuenta !== 'Tarjeta Credito') return null

    // Si las fechas son iguales a las actuales, no proponemos nada (no es cambio).
    if (cuentaActual.fecha_cierre_tarjeta === proxCierreRaw
        && cuentaActual.fecha_vencimiento_tarjeta === proxVencRaw) {
      return null
    }

    return {
      proximo_cierre:      proxCierreRaw,
      proximo_vencimiento: proxVencRaw,
      actual_cierre:       cuentaActual.fecha_cierre_tarjeta,
      actual_vencimiento:  cuentaActual.fecha_vencimiento_tarjeta,
    }
  }

  // Helper para dispatchar consumos según titular detectado por Claude.
  // Si cuenta_id viene (el user está conciliando una tarjeta principal),
  // cargamos todas las adicionales de esa principal + ella misma con sus
  // nombre_titular, y matcheamos case-insensitive + trim. Agregamos un
  // campo `cuenta_origen_sugerida` a cada transacción.
  async function dispatchTitulares(transacciones: unknown[]): Promise<unknown[]> {
    if (!cuenta_id || !Array.isArray(transacciones) || transacciones.length === 0) {
      return transacciones
    }
    // Cargar principal + adicionales de la principal con nombre_titular
    const { data: candidatas } = await supabase
      .from('cuentas')
      .select('id, nombre_titular, tarjeta_principal_id')
      .eq('user_id', user!.id)
      .eq('tipo_cuenta', 'Tarjeta Credito')
      .or(`id.eq.${cuenta_id},tarjeta_principal_id.eq.${cuenta_id}`)
    type Row = { id: string; nombre_titular: string | null; tarjeta_principal_id: string | null }
    const rows = (candidatas ?? []) as unknown as Row[]
    // Index normalizado: lower+trim del nombre_titular → cuenta.id
    const titularIndex = new Map<string, string>()
    for (const r of rows) {
      if (r.nombre_titular) {
        const key = r.nombre_titular.trim().toLowerCase()
        if (key) titularIndex.set(key, r.id)
      }
    }
    // Si no hay ninguna cuenta con titular cargado, no hay nada que dispatchar
    if (titularIndex.size === 0) {
      return transacciones.map(t => {
        if (typeof t !== 'object' || t === null) return t
        return { ...t, cuenta_origen_sugerida: cuenta_id }
      })
    }
    return transacciones.map(t => {
      if (typeof t !== 'object' || t === null) return t
      const row = t as Record<string, unknown>
      const titular = typeof row.titular === 'string' ? row.titular.trim().toLowerCase() : ''
      const matched = titular ? titularIndex.get(titular) : null
      return { ...row, cuenta_origen_sugerida: matched ?? cuenta_id }
    })
  }

  // Intento de parse normal
  const parsed = parseClaudeJSON<{
    transacciones?:        unknown[]
    proximo_cierre?:       unknown
    proximo_vencimiento?:  unknown
  }>(rawText)
  if (parsed) {
    const fechas_propuestas = await buildFechasPropuestas(parsed.proximo_cierre, parsed.proximo_vencimiento)
    const transacciones = await dispatchTitulares(parsed.transacciones ?? [])
    const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
    return NextResponse.json({
      ok: true,
      transacciones,
      fechas_propuestas,
    }, { headers: committed ? usageHeaders(committed) : {} })
  }

  // Si el JSON está truncado, intentar rescatar el array de transacciones.
  // En este path no intentamos extraer fechas propuestas — si el JSON se
  // truncó, lo más probable es que las fechas (que están en el encabezado)
  // estén OK, pero no podemos garantizarlo y preferimos no proponer.
  const recovered = recoverPartialArray(rawText, 'transacciones')
  if (recovered) {
    console.warn(`[parsear-resumen] Partial parse recovered ${recovered.length} transactions`)
    const transacciones = await dispatchTitulares(recovered)
    const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
    return NextResponse.json({
      ok: true,
      transacciones,
      fechas_propuestas: null,
    }, { headers: committed ? usageHeaders(committed) : {} })
  }

  console.error('[parsear-resumen] Could not parse Claude response:', rawText.slice(0, 500))
  return NextResponse.json(
    { error: 'No se pudieron extraer los datos del resumen.' },
    { status: 422 }
  )
}
