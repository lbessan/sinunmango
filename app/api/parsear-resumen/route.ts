import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'
import { getEffectivePlan } from '@/lib/subscription'
import { checkMonthlyLimit, commitMonthlyUsage, isOnboardingActive, usageHeaders } from '@/lib/usage-limits'
import { parseClaudeJSON, recoverPartialArray } from '@/lib/parse-claude-json'
import { dedupTransaccionesCuotas, marcarYaExistentes, filtrarPagosTarjeta } from '@/lib/dedup-transacciones'
import { verificarResumen, type ControlResumen } from '@/lib/resumen-checksum'
import { splitPdfEnChunks } from '@/lib/pdf-split'
import { MODEL_PARSEAR_RESUMEN } from '@/lib/claude-models'
import { isPdfEncrypted, extractTextFromPdf } from '@/lib/pdf-decrypt'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024  // ~3.75 MB binario. PDFs típicos < 2 MB.
// Vercel Hobby corta a 60s. Dejamos 50s para el fetch a Claude + 10s de
// margen para el dispatch + commit de usage + response. Con el modelo
// Haiku (más rápido que Sonnet) y max_tokens reducido, alcanza para
// resúmenes con adicionales (~20-25s en práctica).
const CLAUDE_TIMEOUT_MS    = 50_000

// Hobby tope = 60s. Lo dejamos explícito para que cuando migremos a Pro
// solo subir este número (y opcionalmente CLAUDE_TIMEOUT_MS).
export const maxDuration = 60

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
  // getEffectivePlan: si el user es invitee de un workspace ajeno, usa
  // el plan del owner (acceso Pro vía workspace_share). Si está en su
  // propio workspace, su plan normal.
  const plan         = await getEffectivePlan(supabase, user)
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
    // monto = NATIVO por cuota (ARS si moneda ARS, USD si USD). El dedup contra
    // estos movs lo hace el código (marcarYaExistentes), no Claude.
    movimientosExistentes: { monto: number; moneda?: string; fecha: string; cuotas?: number; cuotas_total?: number }[]
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

  // Nota: el dedup contra movs ya cargados NO se hace acá por prompt (era poco
  // confiable cuando el nombre difería). Claude solo EXTRAE; el `ya_existe` lo
  // recalcula el código con marcarYaExistentes() por monto+moneda+cuota.

  type ParsedResumen = {
    transacciones?:       unknown[]
    control?:             ControlResumen
    cierre_actual?:       unknown
    vencimiento_actual?:  unknown
    proximo_cierre?:      unknown
    proximo_vencimiento?: unknown
  }

  // Una llamada a Claude con UN documento (PDF base64) o con el texto ya
  // extraído. Devuelve el JSON parseado (o recuperado si vino truncado), o null
  // si falló el parse. Los timeouts los deja propagar para que el caller decida.
  async function callClaude(docBase64: string | null): Promise<ParsedResumen | null> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey!,   // garantizado por el guard de arriba (if !apiKey → 503)
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model:      MODEL_PARSEAR_RESUMEN,
      max_tokens: 10000,
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
                    data:       docBase64 ?? '',
                  },
                }]),
            {
              type: 'text',
              text: `Analizá este resumen de tarjeta de crédito y extraé los siguientes items:

1. CONSUMOS del titular principal Y DE TODAS LAS TARJETAS ADICIONALES. El resumen normalmente tiene secciones separadas tipo "Consumos de [Nombre Titular]" o "Consumos [Nombre Adicional]". Incluí TODOS, identificando el titular de cada uno con el campo "titular".
   IMPORTANTE — NO DUPLIQUES: cada consumo va UNA SOLA VEZ. Muchos resúmenes listan las compras en cuotas en DOS lugares: en los consumos del mes Y en una sección aparte de "Detalle de cuotas", "Plan de cuotas", "Cuotas a vencer", "Financiación" o "Próximas cuotas". Tomá la cuota SOLO de los consumos del período (la que efectivamente se cobra este mes, ej. "C.05/12"). IGNORÁ por completo las secciones que proyectan cuotas futuras / a vencer — esas NO son consumos de este resumen.
2. DESCUENTOS Y CRÉDITOS A FAVOR que aparezcan EN CUALQUIER PARTE del resumen (incluso fuera de la sección de consumos, en el encabezado o en secciones propias). Ejemplos: "CR.RG ...", "BONIF. CONSUMO ...", "REINTEGRO ...", "DESCUENTO ...", ajustes con monto negativo.
3. TODOS los items INDIVIDUALES de la sección "Impuestos, cargos e intereses" (si existe), cada uno por separado
4. FECHAS. Leé las etiquetas EXACTAS del encabezado, NO las confundas entre sí:
   - cierre_actual: la fecha de "CIERRE ACTUAL" / "Cierre" de ESTE resumen (YYYY-MM-DD).
   - vencimiento_actual: la fecha de "VENCIMIENTO ACTUAL" / "Vencimiento" de ESTE resumen (YYYY-MM-DD).
   - proximo_cierre: SOLO el valor de la etiqueta "PRÓXIMO CIERRE" (YYYY-MM-DD). NO uses el vencimiento actual acá — son distintos.
   - proximo_vencimiento: SOLO el valor de la etiqueta "PRÓXIMO VENCIMIENTO" (YYYY-MM-DD).
   Devolvé null en las que no figuren explícitamente. NO infieras ni calcules ninguna fecha.
5. TOTALES DE CONTROL del encabezado/resumen de saldos (los usamos para verificar que no falte ni sobre nada). Todos en PESOS, como número:
   - saldo_anterior: "SALDO ANTERIOR" en pesos.
   - su_pago: el pago del resumen anterior ("SU PAGO EN PESOS", "Su pago"), como número POSITIVO (aunque figure con signo menos).
   - total_consumos: el "TOTAL CONSUMOS" / "Total consumos de ..." en pesos (si hay varias tarjetas/titulares, la SUMA de todos los "Total consumos").
   - saldo_actual: "SALDO ACTUAL" en pesos.
   Devolvé null en los que no encuentres.

Para cada item extraé:
- fecha: la fecha que figura en ESA línea del consumo (la fecha de la compra), en formato YYYY-MM-DD. Copiala EXACTA del resumen — el día Y EL MES tal como aparecen en esa línea. Prestá MUCHA atención a no equivocar el mes (ej. no confundas "JUL"/julio con "JUN"/junio, ni "MAY" con "MAR"). NO la ajustes al período, al mes de cierre, ni a ninguna otra fecha del encabezado.
- detalle (descripción limpia, sin códigos internos ni número de cupón)
- monto_ars (monto en pesos como número positivo. Si es en dólares, poné null)
- monto_usd (monto en dólares como número positivo. Si es en pesos, poné null)
- cuotas (número de cuota actual si dice "C.XX/YY", sino 1)
- cuotas_total (total de cuotas si dice "C.XX/YY", sino 1)
- ya_existe (dejá SIEMPRE en false — el sistema detecta los duplicados por su cuenta)
- es_impuesto (true para CADA item de la sección impuestos/cargos/intereses, individualmente)
- es_descuento (true para bonificaciones, reintegros, descuentos y créditos a favor — siempre monto POSITIVO)
- titular (string con el NOMBRE DEL TITULAR exacto tal como figura en el resumen en el header de la sección donde está el consumo — ej: "Celeste Cerono", "L Bessan Nofal". Si el consumo es del titular principal y no hay subsección, o si es un descuento/impuesto general sin titular asociado, devolvé null. Es el dato que usamos para dispatchar consumos a la tarjeta adicional correcta.)

Para los impuestos: listá CADA LÍNEA individualmente (no las sumes). Si el PDF tiene varias páginas, asegurate de incluir todos los items de impuestos de todas las páginas. Cada item va con es_impuesto: true.
Para descuentos: incluílos individualmente con monto POSITIVO y es_descuento: true. Buscalos en TODO el documento, no solo en la sección de consumos.

Devolvé ÚNICAMENTE un JSON válido con este formato exacto, sin markdown ni texto adicional:
{
  "cierre_actual": "2026-07-23",
  "vencimiento_actual": "2026-08-03",
  "proximo_cierre": "2026-08-20",
  "proximo_vencimiento": "2026-09-03",
  "control": {
    "saldo_anterior": 545412.11,
    "su_pago": 545412.11,
    "total_consumos": 482948.65,
    "saldo_actual": 488744.03
  },
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
- NO incluyas la sección de CUOTAS FUTURAS: "Total de cuotas a vencer", "Cuotas a vencer", "Próximas cuotas", "Plan de cuotas a vencer", las columnas por mes (Agosto/26, Setiembre/26, …). Esas son cuotas de meses SIGUIENTES, NO consumos de este resumen. Tomá cada compra en cuotas UNA sola vez, de la sección de consumos del período (la que dice "C.XX/YY"). Si sumás las cuotas a vencer, el total no va a cerrar.
- NO incluyas los PAGOS de la tarjeta (ej. "Su pago en pesos", "SU PAGO", "PAGO RECIBIDO", "Pago mínimo", "Pagos y créditos"). NO son consumos NI descuentos: son la cancelación del saldo del resumen anterior. Ignoralos por completo aunque figuren con monto a favor / en verde.
- SÍ incluí descuentos y créditos a favor aunque estén fuera de la sección de consumos (bonificaciones, reintegros, ajustes) — pero un PAGO no es un descuento.
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
    if (!res.ok) {
      console.error('[parsear-resumen] Claude API error:', await res.text().catch(() => ''))
      return null
    }
    const data    = await res.json()
    const rawText = data.content?.[0]?.text ?? ''
    const p = parseClaudeJSON<ParsedResumen>(rawText)
    if (p) return p
    const rec = recoverPartialArray(rawText, 'transacciones')
    if (rec) {
      console.warn(`[parsear-resumen] Partial parse recovered ${rec.length} transactions`)
      return { transacciones: rec }
    }
    console.error('[parsear-resumen] Could not parse Claude response:', rawText.slice(0, 300))
    return null
  }

  // Une el resultado de varias páginas: concatena transacciones y toma de cada
  // campo de encabezado / control el primer valor no nulo que haya aparecido.
  function mergeParsed(parts: ParsedResumen[]): ParsedResumen {
    const firstNonNull = (k: keyof ParsedResumen) => {
      for (const p of parts) { const v = p[k]; if (v !== undefined && v !== null) return v }
      return undefined
    }
    const control: ControlResumen = {}
    for (const p of parts) {
      if (!p.control) continue
      for (const k of ['saldo_anterior', 'su_pago', 'total_consumos', 'saldo_actual'] as const) {
        const v = p.control[k]
        if ((control[k] === undefined || control[k] === null) && v !== undefined && v !== null) control[k] = v
      }
    }
    return {
      transacciones:       parts.flatMap(p => Array.isArray(p.transacciones) ? p.transacciones : []),
      control,
      cierre_actual:       firstNonNull('cierre_actual'),
      vencimiento_actual:  firstNonNull('vencimiento_actual'),
      proximo_cierre:      firstNonNull('proximo_cierre'),
      proximo_vencimiento: firstNonNull('proximo_vencimiento'),
    }
  }

  // Extracción: si es texto (PDF desencriptado) → 1 llamada. Si es PDF binario →
  // lo partimos en páginas y las procesamos EN PARALELO, porque los resúmenes de
  // imagen no entran enteros en el tope de 60s de Vercel Hobby. Cada página es
  // chica y rápida; el wall-clock total ≈ la página más lenta.
  let parsed: ParsedResumen | null
  try {
    if (extractedText !== null) {
      parsed = await callClaude(null)
    } else {
      const chunks = await splitPdfEnChunks(pdf)
      if (chunks.length <= 1) {
        parsed = await callClaude(chunks[0])
      } else {
        // Si una página puntual falla/timeoutea, la dejamos en null (el checksum
        // avisa si por eso no cuadra) y seguimos con las demás.
        const parts = await Promise.all(chunks.map(c => callClaude(c).catch(() => null)))
        const ok = parts.filter((p): p is ParsedResumen => p !== null)
        parsed = ok.length > 0 ? mergeParsed(ok) : null
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[parsear-resumen] Claude timeout')
      return NextResponse.json({ error: 'El PDF tardó demasiado en procesarse. Probá con un archivo más chico.' }, { status: 504 })
    }
    console.error('[parsear-resumen] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio de IA.' }, { status: 502 })
  }

  // ── Helper: si vino cuenta_id, calcular fechas_propuestas comparando con la
  //   cuenta actual. Solo devolvemos algo si las fechas son válidas (futuras,
  //   coherentes) Y distintas de las actuales. Si Claude no las extrajo o son
  //   inválidas, devolvemos null (= no proponer cambio).
  async function buildFechasPropuestas(
    proxCierreRaw: unknown,
    proxVencRaw:   unknown,
    vencActualRaw: unknown,   // "VENCIMIENTO ACTUAL" del resumen — para el sanity check
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

    // Sanity anti-confusión: el PRÓXIMO cierre tiene que ser POSTERIOR al
    // vencimiento ACTUAL del resumen. El bug clásico es que el modelo tome el
    // "VENCIMIENTO ACTUAL" (ej. 03-Ago) y lo devuelva como próximo cierre.
    if (typeof vencActualRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(vencActualRaw)
        && new Date(proxCierreRaw + 'T12:00:00') <= new Date(vencActualRaw + 'T12:00:00')) {
      return null
    }

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

  if (!parsed) {
    return NextResponse.json(
      { error: 'No se pudieron extraer los datos del resumen.' },
      { status: 422 },
    )
  }

  const fechas_propuestas = await buildFechasPropuestas(parsed.proximo_cierre, parsed.proximo_vencimiento, parsed.vencimiento_actual)
  // Dedup defensivo: a veces una cuota figura en dos secciones (consumos + plan).
  const sinDuplicados = dedupTransaccionesCuotas(parsed.transacciones ?? [])
  // Sacamos los pagos de la tarjeta (no son consumos ni descuentos).
  const sinPagos      = filtrarPagosTarjeta(sinDuplicados)
  // Checksum: ¿lo extraído cuadra con los totales que declara el resumen?
  const verificacion  = verificarResumen(sinPagos, parsed.control ?? {})
  // Dedup contra lo YA cargado (por monto+moneda, sin depender del nombre/fecha).
  const marcadas      = marcarYaExistentes(sinPagos, movimientosExistentes)
  const transacciones = await dispatchTitulares(marcadas)
  const committed = inOnboarding ? null : await commitMonthlyUsage(supabase, 'resumen', plan.has_pro_access)
  return NextResponse.json({
    ok: true,
    transacciones,
    fechas_propuestas,
    verificacion,
  }, { headers: committed ? usageHeaders(committed) : {} })
}
