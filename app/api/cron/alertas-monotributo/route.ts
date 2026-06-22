import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import {
  generarAlertasMonotributo,
  facturacionPeriodoEvaluacion,
  proximaRecategorizacion,
  type FacturaEmitida,
  type AlertaMonotributo,
} from '@/lib/monotributo'

// ─── Cron de alertas del monotributo ─────────────────────────────────────────
// Semanal (lunes). Para cada user con config de monotributo, evalúa sus
// alertas y manda email SOLO si hay alguna warning/danger. Las alertas info
// (recategorización próxima sin exceso) viven solo en el dashboard — no
// queremos spamear con avisos no urgentes.
//
// Sin tracking de estado a propósito: si la condición persiste (seguís cerca
// del límite), el recordatorio semanal es información útil, no ruido. Es app
// de uso personal — si molesta, se baja la frecuencia del cron.

type ConfigRow = {
  user_id:                  string
  categoria:                string
  actividad:                string
  limite_facturacion_anual: number
  costo_mensual:            number
}

function buildEmailHtml(
  alertas:     AlertaMonotributo[],
  facturado12: number,
  limite:      number,
  categoria:   string,
  recatMes:    string,
  recatDias:   number,
  baseUrl:     string,
) {
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
  const pct = limite > 0 ? Math.min((facturado12 / limite) * 100, 100) : 0
  const barColor = pct >= 95 ? '#dc2626' : pct >= 80 ? '#d97706' : '#1a6b5a'

  const alertaRows = alertas.map(a => {
    const color = a.nivel === 'danger' ? '#dc2626' : a.nivel === 'warning' ? '#d97706' : '#0284c7'
    return `
      <div style="padding:14px 16px;border-left:3px solid ${color};background:${color}0d;border-radius:8px;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:3px;">${a.titulo}</div>
        <div style="font-size:13px;color:#475569;line-height:1.5;">${a.detalle}</div>
      </div>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0d2137,#1B3A6B);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">sinunmango · monotributo</p>
      <p style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;">Estado de tu facturación</p>
    </div>

    <div style="padding:24px 28px 8px;">
      <p style="margin:0 0 6px;font-size:13px;color:#64748b;">Facturado del período · Categoría ${categoria}</p>
      <p style="margin:0 0 10px;font-size:24px;font-weight:700;color:#1e293b;">${fmt(facturado12)} <span style="font-size:14px;color:#94a3b8;font-weight:400;">/ ${fmt(limite)}</span></p>
      <div style="height:10px;background:#f1f5f9;border-radius:6px;overflow:hidden;">
        <div style="height:100%;width:${pct.toFixed(1)}%;background:${barColor};border-radius:6px;"></div>
      </div>
      <p style="margin:8px 0 0;font-size:12px;color:#64748b;">${pct.toFixed(0)}% del límite · próxima recategorización: ${recatMes} (en ${recatDias} días)</p>
    </div>

    <div style="padding:16px 28px;">
      ${alertaRows}
    </div>

    <div style="padding:4px 28px 24px;text-align:center;">
      <a href="${baseUrl}/monotributo" style="display:inline-block;background:linear-gradient(135deg,#1B3A6B,#1a6b5a);color:white;font-size:13px;font-weight:600;padding:11px 24px;border-radius:10px;text-decoration:none;">
        Ver detalle en sinunmango →
      </a>
    </div>

    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        Resumen semanal de monotributo · enviado automáticamente por sinunmango
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const resendApiKey  = process.env.RESEND_API_KEY
  const fromEmail     = process.env.RESEND_FROM ?? 'alertas@sinunmango.com.ar'
  const baseUrl       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sinunmango.com.ar'
  const emailFallback = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'

  // ── Cargar todas las configs de monotributo ──
  const { data: configsRaw, error } = await adminClient
    .from('monotributo_config')
    .select('user_id, categoria, actividad, limite_facturacion_anual, costo_mensual')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const configs = (configsRaw ?? []) as ConfigRow[]

  if (configs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No hay configs de monotributo.' })
  }

  const recat = proximaRecategorizacion()
  const results: { user: string; sent: boolean; alertas: number }[] = []
  let totalSent = 0

  for (const config of configs) {
    // Facturas del user
    const { data: facturasRaw } = await adminClient
      .from('facturas_emitidas')
      .select('id, fecha, cliente, monto')
      .eq('user_id', config.user_id)
    const facturas = (facturasRaw ?? []) as FacturaEmitida[]

    const alertas = generarAlertasMonotributo(
      {
        categoria:                config.categoria,
        limite_facturacion_anual: config.limite_facturacion_anual,
        costo_mensual:            config.costo_mensual,
        actividad:                config.actividad as 'servicios' | 'venta_bienes',
      },
      facturas,
    )

    // Solo mandamos email si hay alertas warning/danger (las info son solo dashboard).
    const accionables = alertas.filter(a => a.nivel === 'warning' || a.nivel === 'danger')
    if (accionables.length === 0) {
      results.push({ user: config.user_id, sent: false, alertas: 0 })
      continue
    }

    if (!resendApiKey) {
      console.log(`[alertas-monotributo] RESEND_API_KEY no configurada. User ${config.user_id}:`, accionables.map(a => a.titulo))
      results.push({ user: config.user_id, sent: false, alertas: accionables.length })
      continue
    }

    // Email del user
    let toEmail = emailFallback
    try {
      const { data: { user: u } } = await adminClient.auth.admin.getUserById(config.user_id)
      if (u?.email) toEmail = u.email
    } catch { /* usa fallback */ }

    const facturado12 = facturacionPeriodoEvaluacion(facturas)
    const html = buildEmailHtml(
      accionables, facturado12, config.limite_facturacion_anual,
      config.categoria, recat.mes, recat.diasRestantes, baseUrl,
    )
    const hayDanger = accionables.some(a => a.nivel === 'danger')
    const subject = hayDanger
      ? '🔴 Monotributo: atención con tu límite de facturación'
      : '⏰ Monotributo: te estás acercando al límite'

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, html }),
    })

    if (!emailRes.ok) {
      const body = await emailRes.text()
      console.error(`[alertas-monotributo] Resend error for ${config.user_id}:`, body)
      results.push({ user: config.user_id, sent: false, alertas: accionables.length })
    } else {
      results.push({ user: config.user_id, sent: true, alertas: accionables.length })
      totalSent++
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent, results })
}
