import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getEffectivePlan } from '@/lib/subscription'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCurrentWorkspace } from '@/lib/workspace'
import { calcularReporteMes } from '@/lib/reporte-mes/data'
import { reporteToHtml } from '@/lib/reporte-mes/html'
import { htmlToPdf } from '@/lib/reporte-mes/pdf'

// ─── GET /api/reportes/mes-pdf?mes=YYYY-MM ────────────────────────────────────
//
// Genera un PDF del mes indicado para el workspace activo.
// Gateado por plan EFECTIVO (un invitee Pro-via-share puede generarlo
// del workspace del owner igual que si fuera propio).
//
// Rate limit: 3 por 5 minutos. Cada generación cuesta ~5-10s de CPU en
// Vercel + memoria, no queremos que un user spamee descargas.
//
// Response: application/pdf binary con Content-Disposition: attachment.

export const runtime     = 'nodejs'    // puppeteer no es edge-compatible
export const maxDuration = 60          // Vercel Hobby max; Pro acepta 300+

function isValidMes(s: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(s)) return false
  const [y, m] = s.split('-').map(Number)
  if (y < 2000 || y > 2100) return false
  if (m < 1 || m > 12) return false
  return true
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // ── Plan check (efectivo: usa el del owner del workspace activo) ──────
  const plan = await getEffectivePlan(supabase, user)
  if (!plan.has_pro_access) {
    return NextResponse.json(
      { error: 'Reporte PDF mensual requiere plan Pro.', requires_pro: true },
      { status: 403 },
    )
  }

  // ── Rate limit ────────────────────────────────────────────────────────
  const rl = await checkRateLimit(user.id, '/api/reportes/mes-pdf', {
    max: 3, windowSeconds: 300,
  })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  // ── Validar mes ───────────────────────────────────────────────────────
  const mes = (req.nextUrl.searchParams.get('mes') ?? '').trim()
  if (!isValidMes(mes)) {
    return NextResponse.json(
      { error: 'Parámetro `mes` inválido. Esperado YYYY-MM (ej: 2026-05).' },
      { status: 400 },
    )
  }

  // ── Resolver workspace target ─────────────────────────────────────────
  const workspace = await getCurrentWorkspace(user.id)

  // ── Generar ───────────────────────────────────────────────────────────
  try {
    const data = await calcularReporteMes(supabase, workspace.ownerUserId, mes)
    const html = reporteToHtml(data)
    const pdf  = await htmlToPdf(html)

    const filename = `sinunmango-reporte-${mes}.pdf`
    // NextResponse.body acepta BodyInit (string, Blob, ArrayBuffer, FormData,
    // ReadableStream, URLSearchParams). Uint8Array<ArrayBufferLike> de
    // puppeteer 25 no matchea directamente — copiamos el buffer a un
    // ArrayBuffer plain o lo envolvemos en Blob.
    return new NextResponse(new Blob([pdf as BlobPart], { type: 'application/pdf' }), {
      status:  200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[reportes/mes-pdf] error generando:', err)
    return NextResponse.json(
      { error: 'No pudimos generar el reporte. Intentá de nuevo en un momento.' },
      { status: 500 },
    )
  }
}
