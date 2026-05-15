import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'

type CategoriaJoin = { nombre_categoria?: string | null } | null

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function buildEmailHtml(
  ingresos: number, gastos: number, resultado: number,
  topGastos: { nombre: string; total: number }[],
  semana: string, baseUrl: string
) {
  const esPositivo = resultado >= 0
  const colorRes   = esPositivo ? '#16a34a' : '#dc2626'

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
    <div style="background:linear-gradient(135deg,#0d2137,#0b2d55);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.55);font-size:11px;text-transform:uppercase;letter-spacing:1px;">sinunmango</p>
      <p style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;">Resumen semanal</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:12px;">${semana}</p>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#f1f5f9;">
      <div style="background:white;padding:20px 16px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Ingresos</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#16a34a;">$${fmt(ingresos)}</p>
      </div>
      <div style="background:white;padding:20px 16px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Gastos</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#dc2626;">$${fmt(gastos)}</p>
      </div>
      <div style="background:white;padding:20px 16px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Resultado</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${colorRes};">${esPositivo ? '+' : '-'}$${fmt(Math.abs(resultado))}</p>
      </div>
    </div>

    <!-- Top gastos -->
    ${topGastos.length > 0 ? `
    <div style="padding:20px 0 0;">
      <p style="margin:0 0 8px;padding:0 16px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Top gastos por categoría</p>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${filas}</tbody>
      </table>
    </div>` : ''}

    <!-- CTA -->
    <div style="padding:24px 28px;text-align:center;">
      <a href="${baseUrl}/dashboard"
        style="display:inline-block;background:linear-gradient(135deg,#0d2137,#0b2d55);color:white;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
        Ver dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        Resumen automático de sinunmango ·
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

  // Rango: lunes pasado → hoy (domingo)
  const hoy     = new Date()
  const diaSem  = hoy.getDay() // 0=dom, 1=lun...
  const diffFin = diaSem === 0 ? 0 : 7 - diaSem  // días hasta el próximo domingo (0 si hoy es dom)
  const finSem  = new Date(hoy); finSem.setDate(hoy.getDate() - diffFin)
  const iniSem  = new Date(finSem); iniSem.setDate(finSem.getDate() - 6)
  const desde   = iniSem.toISOString().slice(0, 10)
  const hasta   = finSem.toISOString().slice(0, 10)
  const semanaLabel = `${iniSem.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} – ${finSem.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`

  // Cargar preferencias de usuarios con resumen semanal activo
  const { data: prefs } = await adminClient
    .from('user_preferences')
    .select('user_id, alerta_resumen_semanal')
    .eq('alerta_resumen_semanal', true)

  if (!prefs || prefs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'Sin usuarios con resumen semanal activo.' })
  }

  const userIds = prefs.map(p => p.user_id)
  let totalSent = 0

  for (const uid of userIds) {
    // Movimientos de la semana
    const { data: movs } = await adminClient
      .from('movimientos')
      .select('tipo_movimiento, monto, categorias(nombre_categoria)')
      .eq('user_id', uid)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .in('tipo_movimiento', ['Ingreso', 'Gasto'])

    const ingresos  = (movs ?? []).filter(m => m.tipo_movimiento === 'Ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos    = (movs ?? []).filter(m => m.tipo_movimiento === 'Gasto').reduce((s, m) => s + m.monto, 0)
    const resultado = Math.round(ingresos - gastos)

    // Top 5 categorías de gasto
    const catMap: Record<string, number> = {}
    for (const m of (movs ?? []).filter(m => m.tipo_movimiento === 'Gasto')) {
      const nombre = (m.categorias as CategoriaJoin)?.nombre_categoria ?? 'Sin categoría'
      catMap[nombre] = (catMap[nombre] ?? 0) + m.monto
    }
    const topGastos = Object.entries(catMap)
      .map(([nombre, total]) => ({ nombre, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    // Email del usuario
    let toEmail = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'
    try {
      const { data: { user } } = await adminClient.auth.admin.getUserById(uid)
      if (user?.email) toEmail = user.email
    } catch {}

    if (!resendApiKey) {
      console.log(`[resumen-semanal] Sin RESEND_API_KEY. User ${uid}: +${Math.round(ingresos)} / -${Math.round(gastos)}`)
      continue
    }

    const html = buildEmailHtml(Math.round(ingresos), Math.round(gastos), resultado, topGastos, semanaLabel, baseUrl)
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `📊 Tu resumen semanal — ${semanaLabel}`,
        html,
      }),
    })

    if (emailRes.ok) totalSent++
    else console.error(`[resumen-semanal] Error para ${uid}:`, await emailRes.text())
  }

  return NextResponse.json({ ok: true, sent: totalSent })
}
