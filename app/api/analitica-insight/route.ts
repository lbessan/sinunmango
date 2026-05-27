import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getEffectivePlan } from '@/lib/subscription'
import { checkRateLimit } from '@/lib/rate-limit'
import { todayAR } from '@/lib/timezone'
import { MODEL_ANALITICA_INSIGHT } from '@/lib/claude-models'

export const runtime = 'nodejs'

// ─── POST /api/analitica-insight ─────────────────────────────────────────────
//
// Genera un insight narrativo del período usando Claude Haiku (rápido + barato).
// Tipos soportados:
//   - "narrativa": párrafo corto + 3 highlights (Resumen tab)
//   - "profundo":  reporte estructurado con secciones (Análisis profundo on-demand)
//
// Gateado por plan: requiere Pro/Grandfathered.

const SYSTEM_NARRATIVA = `Sos Manguito, el asistente financiero de sinunmango — una app de finanzas personales argentina.
Tu trabajo es darle al usuario un insight narrativo corto sobre su rendimiento financiero en el período analizado.

REGLAS:
- Tono: amigable, directo, argentino (tuteo). Mantené naturalidad — escribí como hablás.
- Longitud: el campo "narrativa" debe ser entre 60 y 120 palabras. Concreto, no genérico.
- Conectá señales: no listes datos sueltos, contá una historia. "Bajaste X porque", "tu mejor mes en Y", etc.
- Si hay anomalías o crecimientos significativos, mencionálos con contexto.
- Si hay recomendaciones obvias, sugerí UNA al final del párrafo (no más).
- No inventes datos que no estén en el contexto. No menciones meses futuros.
- No uses emojis en la narrativa. Sólo en highlights donde se indique.

DEVOLVÉ SIEMPRE JSON VÁLIDO con esta forma exacta:
{
  "narrativa": "<párrafo de 60-120 palabras>",
  "highlights": [
    { "icon": "trending-up" | "trending-down" | "alert" | "award" | "target" | "calendar", "tone": "positive" | "negative" | "warning" | "neutral", "text": "<texto corto de máx 80 chars>" },
    { ... },
    { ... }
  ]
}

Exactamente 3 highlights. Cada highlight debe ser ACCIONABLE o REVELADOR — no repitas info de la narrativa.`

const SYSTEM_PROFUNDO = `Sos Manguito, el asistente financiero de sinunmango. Generá un análisis profundo del período financiero del usuario.

REGLAS:
- Tono: amigable, directo, argentino (tuteo).
- Estructura: 4 secciones con headers en formato Markdown (## Sección).
- Las 4 secciones son: "Lo destacado del período", "Patrones que detecté", "Áreas de oportunidad", "Outlook".
- En cada sección, sé específico — citá números y categorías reales del contexto.
- En "Áreas de oportunidad" da entre 2-4 recomendaciones concretas con monto estimado de ahorro si aplica.
- No inventes datos. No proyectes más de 12 meses al futuro.
- Longitud total: entre 300 y 600 palabras.

DEVOLVÉ SIEMPRE JSON VÁLIDO con esta forma:
{
  "reporte": "<contenido en Markdown con ## headers>"
}`

type InsightType = 'narrativa' | 'profundo'

type RequestBody = {
  type: InsightType
  periodo: { desde: string; hasta: string }
  contexto: string   // datos pre-formateados como texto que el AI va a analizar
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Plan check: feature Pro (effective: aplica el plan del owner del workspace activo) ──
  const plan = await getEffectivePlan(supabase, user)
  if (!plan.has_pro_access) {
    return NextResponse.json(
      { error: 'Requiere plan Pro', requires_pro: true },
      { status: 403 }
    )
  }

  // ── Rate limit: análisis profundo más caro, límite más bajo ──
  const body = await req.json() as RequestBody
  const isProfundo = body.type === 'profundo'

  const rl = await checkRateLimit(
    user.id,
    `/api/analitica-insight:${body.type}`,
    isProfundo
      ? { max: 5,  windowSeconds: 300 }  // 5 por 5 min para profundo
      : { max: 20, windowSeconds: 60 },  // 20 por minuto para narrativa
  )
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // ── Llamar a Claude ──
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI no configurada' }, { status: 503 })
  }

  const systemPrompt = isProfundo ? SYSTEM_PROFUNDO : SYSTEM_NARRATIVA
  const userPrompt   = `Hoy es ${todayAR()}. Estos son los datos del período (${body.periodo.desde} → ${body.periodo.hasta}):\n\n${body.contexto}\n\nGenerá el JSON pedido.`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL_ANALITICA_INSIGHT,
      max_tokens: isProfundo ? 2500 : 700,
      system: [
        // Sistema cacheable — mismo prompt para todos los usuarios del mismo tipo
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.error('[analitica-insight] Claude timeout')
      return NextResponse.json({ error: 'El análisis tardó demasiado. Probá de nuevo.' }, { status: 504 })
    }
    console.error('[analitica-insight] Claude fetch error:', err)
    return NextResponse.json({ error: 'No pudimos contactar al servicio AI.' }, { status: 502 })
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[analitica-insight] Claude error:', res.status, errText.slice(0, 200))
    return NextResponse.json({ error: 'Servicio AI no disponible' }, { status: 502 })
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''

  // Intentar parsear el JSON devuelto. A veces Claude envuelve en ```json — lo limpiamos.
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('[analitica-insight] JSON parse failed:', cleaned.slice(0, 200))
    return NextResponse.json({ error: 'Respuesta AI inválida' }, { status: 502 })
  }

  return NextResponse.json(parsed)
}
