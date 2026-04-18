import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────
type GastoFijo = {
  id: string
  nombre_gasto: string
  monto_estimado: number
  moneda: string | null
  dia_vencimiento: number | null
  activo: boolean
  cuentas: { nombre_cuenta: string; tipo_cuenta: string } | null
  categorias: { nombre_categoria: string; icono: string | null } | null
}

// ─── Email builder ─────────────────────────────────────────────────────────────
function buildEmailHtml(gastos: { gasto: GastoFijo; alerta: string; diasRestantes: number }[], baseUrl: string) {
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

  const rows = gastos.map(({ gasto, alerta, diasRestantes }) => {
    const badgeColor   = diasRestantes === 0 ? '#ef4444' : diasRestantes === 1 ? '#f97316' : '#f59e0b'
    const badgeLabel   = diasRestantes === 0 ? 'Vence HOY' : `Vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}`
    const monto        = gasto.moneda === 'USD' ? `US$${fmt(gasto.monto_estimado)}` : `$${fmt(gasto.monto_estimado)}`
    const pagoUrl      = `${baseUrl}/gastos-fijos`

    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:2px;">${gasto.nombre_gasto}</div>
          <div style="font-size:12px;color:#64748b;">${gasto.cuentas?.nombre_cuenta ?? ''} · Día ${gasto.dia_vencimiento}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
          <div style="font-size:15px;font-weight:700;color:#1e293b;">${monto}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
          <span style="display:inline-block;background:${badgeColor}1a;color:${badgeColor};font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;white-space:nowrap;">
            ${badgeLabel}
          </span>
        </td>
      </tr>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(90deg,#1B3A6B,#1a6b5a);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Finanzas LB</p>
      <p style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;">Recordatorio de vencimientos</p>
    </div>
    <!-- Body -->
    <div style="padding:24px 28px 8px;">
      <p style="margin:0 0 16px;font-size:14px;color:#64748b;">Estos gastos fijos vencen próximamente:</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:0 16px 8px;border-bottom:1px solid #f1f5f9;">Gasto</th>
            <th style="text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:0 16px 8px;border-bottom:1px solid #f1f5f9;">Monto</th>
            <th style="text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:0 16px 8px;border-bottom:1px solid #f1f5f9;">Estado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <!-- CTA -->
    <div style="padding:20px 28px 28px;text-align:center;">
      <a href="${baseUrl}/gastos-fijos"
        style="display:inline-block;background:linear-gradient(90deg,#1B3A6B,#1a6b5a);color:white;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
        Registrar pagos →
      </a>
    </div>
    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        Este recordatorio fue enviado automáticamente por Finanzas LB
      </p>
    </div>
  </div>
</body>
</html>`
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify cron secret in production
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const toEmail      = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'
  const fromEmail    = process.env.RESEND_FROM  ?? 'alertas@finanzas-lb.app'
  const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // ── Get all active gastos fijos ──────────────────────────────────────────────
  const { data: gastosRaw, error } = await adminClient
    .from('gastos_fijos')
    .select('*, cuentas(nombre_cuenta, tipo_cuenta), categorias(nombre_categoria, icono)')
    .eq('activo', true)
    .not('dia_vencimiento', 'is', null)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const gastos = (gastosRaw ?? []) as unknown as GastoFijo[]
  const hoy    = new Date()
  const diaHoy = hoy.getDate()

  // ── Filter: vence hoy, en 1 día, en 3 días ──────────────────────────────────
  const ALERTAR_EN = [0, 1, 3] // días de anticipación
  const pendientes = gastos
    .filter(g => g.dia_vencimiento !== null)
    .map(g => {
      const diasRestantes = (g.dia_vencimiento! - diaHoy + 31) % 31 // approximate
      const exact         = g.dia_vencimiento! - diaHoy
      return { gasto: g, diasRestantes: exact >= 0 ? exact : -1, alerta: '' }
    })
    .filter(({ diasRestantes }) => ALERTAR_EN.includes(diasRestantes))
    .map(item => ({
      ...item,
      alerta: item.diasRestantes === 0 ? 'hoy' : `en ${item.diasRestantes} días`,
    }))

  if (pendientes.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No hay vencimientos hoy ni en los próximos días alertados.' })
  }

  // ── Send email via Resend REST API ───────────────────────────────────────────
  if (!resendApiKey) {
    // Log to console if no API key (development / unconfigured)
    console.log('[alertas-vencimientos] RESEND_API_KEY no configurada. Gastos que vencen:', pendientes.map(p => p.gasto.nombre_gasto))
    return NextResponse.json({
      ok: true,
      sent: 0,
      warning: 'RESEND_API_KEY no configurada. Configurala en las variables de entorno.',
      gastos: pendientes.map(p => ({ nombre: p.gasto.nombre_gasto, dias: p.diasRestantes })),
    })
  }

  const html    = buildEmailHtml(pendientes, baseUrl)
  const subject = pendientes.some(p => p.diasRestantes === 0)
    ? `🔴 Vencen HOY: ${pendientes.filter(p => p.diasRestantes === 0).map(p => p.gasto.nombre_gasto).join(', ')}`
    : `⏰ Vencimientos próximos: ${pendientes.map(p => p.gasto.nombre_gasto).slice(0, 2).join(', ')}${pendientes.length > 2 ? ' y más' : ''}`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [toEmail],
      subject,
      html,
    }),
  })

  if (!emailRes.ok) {
    const body = await emailRes.text()
    return NextResponse.json({ ok: false, error: `Resend error: ${body}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: 1, gastos: pendientes.length })
}
