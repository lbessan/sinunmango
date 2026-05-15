import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'

type CategoriaJoin = { nombre_categoria?: string | null } | null

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function buildEmailHtml(
  mes: string, ingresos: number, gastos: number, resultado: number,
  topGastos: { nombre: string; total: number }[],
  baseUrl: string
) {
  const esPositivo = resultado >= 0
  const colorRes   = esPositivo ? '#16a34a' : '#dc2626'
  const [anio, m]  = mes.split('-').map(Number)
  const mesLabel   = new Date(anio, m - 1, 1)
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(' de ', ' ')
    .replace(/^\w/, c => c.toUpperCase())

  const filas = topGastos.map(g => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;">${g.nombre}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;color:#1e293b;">$${fmt(g.total)}</td>
    </tr>`).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d2137,#0f4d3a);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.55);font-size:11px;text-transform:uppercase;letter-spacing:1px;">sinunmango · Informe mensual</p>
      <p style="margin:6px 0 0;color:white;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${mesLabel}</p>
    </div>

    <!-- KPIs grandes -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#f1f5f9;border-bottom:1px solid #f1f5f9;">
      <div style="background:white;padding:24px 20px;">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Ingresos</p>
        <p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#16a34a;">$${fmt(ingresos)}</p>
      </div>
      <div style="background:white;padding:24px 20px;">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Gastos</p>
        <p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#dc2626;">$${fmt(gastos)}</p>
      </div>
    </div>

    <!-- Resultado grande -->
    <div style="padding:24px 28px;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Ahorro del mes</p>
      <p style="margin:6px 0 0;font-size:32px;font-weight:800;color:${colorRes};">${esPositivo ? '+' : '-'}$${fmt(Math.abs(resultado))}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Diferencia entre ingresos y gastos</p>
    </div>

    <!-- Top gastos por categoría -->
    ${topGastos.length > 0 ? `
    <div style="padding:20px 0 0;">
      <p style="margin:0 0 8px;padding:0 16px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Top categorías de gasto</p>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${filas}</tbody>
      </table>
    </div>` : ''}

    <!-- CTA -->
    <div style="padding:24px 28px;text-align:center;">
      <a href="${baseUrl}/dashboard?mes=${mes}"
        style="display:inline-block;background:linear-gradient(135deg,#0d2137,#0f4d3a);color:white;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
        Ver detalle del mes →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        Informe automático de sinunmango ·
        <a href="${baseUrl}/configuracion" style="color:#94a3b8;">Configurar alertas</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail    = process.env.RESEND_FROM       ?? 'alertas@sinunmango.com.ar'
  const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sinunmango.com.ar'

  // Mes anterior
  const hoy      = new Date()
  const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const mes       = `${mesPasado.getFullYear()}-${String(mesPasado.getMonth() + 1).padStart(2, '0')}`
  const desde     = `${mes}-01`
  const hasta_exc = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`

  // Usuarios con resumen mensual activo
  const { data: prefs } = await adminClient
    .from('user_preferences')
    .select('user_id, alerta_resumen_mensual')
    .eq('alerta_resumen_mensual', true)

  if (!prefs || prefs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'Sin usuarios con resumen mensual activo.' })
  }

  const userIds = prefs.map(p => p.user_id)
  let totalSent = 0

  for (const uid of userIds) {
    const { data: movs } = await adminClient
      .from('movimientos')
      .select('tipo_movimiento, monto, categorias(nombre_categoria)')
      .eq('user_id', uid)
      .gte('fecha', desde)
      .lt('fecha', hasta_exc)
      .in('tipo_movimiento', ['Ingreso', 'Gasto'])

    const ingresos  = (movs ?? []).filter(m => m.tipo_movimiento === 'Ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos    = (movs ?? []).filter(m => m.tipo_movimiento === 'Gasto').reduce((s, m) => s + m.monto, 0)
    const resultado = Math.round(ingresos - gastos)

    // Top 5 categorías
    const catMap: Record<string, number> = {}
    for (const m of (movs ?? []).filter(m => m.tipo_movimiento === 'Gasto')) {
      const nombre = (m.categorias as CategoriaJoin)?.nombre_categoria ?? 'Sin categoría'
      catMap[nombre] = (catMap[nombre] ?? 0) + m.monto
    }
    const topGastos = Object.entries(catMap)
      .map(([nombre, total]) => ({ nombre, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    let toEmail = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'
    try {
      const { data: { user } } = await adminClient.auth.admin.getUserById(uid)
      if (user?.email) toEmail = user.email
    } catch {}

    if (!resendApiKey) {
      console.log(`[resumen-mensual] Sin RESEND_API_KEY. User ${uid} ${mes}: +${Math.round(ingresos)} / -${Math.round(gastos)}`)
      continue
    }

    const [anio, m2] = mes.split('-').map(Number)
    const mesLabel = new Date(anio, m2 - 1, 1)
      .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      .replace(' de ', ' ')
      .replace(/^\w/, c => c.toUpperCase())

    const html = buildEmailHtml(mes, Math.round(ingresos), Math.round(gastos), resultado, topGastos, baseUrl)
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `📅 Tu resumen de ${mesLabel}`,
        html,
      }),
    })

    if (emailRes.ok) totalSent++
    else console.error(`[resumen-mensual] Error para ${uid}:`, await emailRes.text())
  }

  return NextResponse.json({ ok: true, sent: totalSent })
}
