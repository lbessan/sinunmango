import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'

// ─── Types ────────────────────────────────────────────────────────────────────
type GastoFijo = {
  id: string
  user_id: string
  nombre_gasto: string
  monto_estimado: number
  moneda: string | null
  dia_vencimiento: number | null
  activo: boolean
  cuentas: { nombre_cuenta: string; tipo_cuenta: string } | null
  categorias: { nombre_categoria: string; icono: string | null } | null
}

type TarjetaParaAlerta = {
  id: string
  user_id: string
  nombre_cuenta: string
  fecha_vencimiento_tarjeta: string | null
}

// AlertaItem: union de gasto fijo y tarjeta, con campos comunes para
// el builder del email. Distinguimos por `kind` para mostrar copy / link
// distinto sin perder tipado.
type AlertaItem =
  | { kind: 'gasto_fijo'; gasto: GastoFijo; diasRestantes: number }
  | { kind: 'tarjeta';    tarjeta: TarjetaParaAlerta; diaVenc: number; diasRestantes: number }

type UserPreferences = {
  user_id: string
  alerta_vencimientos_activa: boolean
  alerta_vencimientos_dias: number[]
}

// ─── Email builder ─────────────────────────────────────────────────────────────
function buildEmailHtml(items: AlertaItem[], baseUrl: string) {
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

  const badgeFor = (diasRestantes: number) => {
    const color = diasRestantes === 0 ? '#ef4444' : diasRestantes === 1 ? '#f97316' : '#f59e0b'
    const label = diasRestantes === 0 ? 'Vence HOY' : `Vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}`
    return `<span style="display:inline-block;background:${color}1a;color:${color};font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;white-space:nowrap;">${label}</span>`
  }

  // Renderer común: izquierda (título + subtítulo), centro (monto opcional), derecha (badge).
  const rowFor = (titulo: string, subtitulo: string, monto: string, diasRestantes: number) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:2px;">${titulo}</div>
          <div style="font-size:12px;color:#64748b;">${subtitulo}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
          <div style="font-size:15px;font-weight:700;color:#1e293b;">${monto}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
          ${badgeFor(diasRestantes)}
        </td>
      </tr>`

  // Split por kind para renderar 2 secciones distintas en el mismo email.
  // Gastos fijos primero, después tarjetas.
  const gfRows = items
    .filter((i): i is Extract<AlertaItem, { kind: 'gasto_fijo' }> => i.kind === 'gasto_fijo')
    .map(i => {
      const monto = i.gasto.moneda === 'USD' ? `US$${fmt(i.gasto.monto_estimado)}` : `$${fmt(i.gasto.monto_estimado)}`
      const sub   = `${i.gasto.cuentas?.nombre_cuenta ?? ''} · Día ${i.gasto.dia_vencimiento}`
      return rowFor(i.gasto.nombre_gasto, sub, monto, i.diasRestantes)
    }).join('')

  const tjRows = items
    .filter((i): i is Extract<AlertaItem, { kind: 'tarjeta' }> => i.kind === 'tarjeta')
    .map(i => rowFor(i.tarjeta.nombre_cuenta, `Tarjeta · Vence día ${i.diaVenc}`, '—', i.diasRestantes))
    .join('')

  const sectionTable = (titleLabel: string, headerLabel: string, rowsHtml: string, ctaHref: string, ctaText: string) => `
    <div style="padding:24px 28px 8px;">
      <p style="margin:0 0 16px;font-size:14px;color:#64748b;">${titleLabel}</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:0 16px 8px;border-bottom:1px solid #f1f5f9;">${headerLabel}</th>
            <th style="text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:0 16px 8px;border-bottom:1px solid #f1f5f9;">Monto</th>
            <th style="text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:0 16px 8px;border-bottom:1px solid #f1f5f9;">Estado</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div style="padding:8px 28px 16px;text-align:center;">
      <a href="${baseUrl}${ctaHref}" style="display:inline-block;background:linear-gradient(135deg,#5c0f2e,#94184A);color:white;font-size:13px;font-weight:600;padding:10px 22px;border-radius:10px;text-decoration:none;">
        ${ctaText}
      </a>
    </div>`

  const gfSection = gfRows
    ? sectionTable('Gastos fijos próximos a vencer:', 'Gasto', gfRows, '/gastos-fijos', 'Registrar pagos →')
    : ''
  const tjSection = tjRows
    ? sectionTable('Vencimientos de tarjeta:', 'Tarjeta', tjRows, '/tarjetas', 'Ver tarjetas →')
    : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#5c0f2e,#94184A);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">sinunmango</p>
      <p style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;">Recordatorio de vencimientos</p>
    </div>
    ${gfSection}
    ${tjSection}
    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        Este recordatorio fue enviado automáticamente por sinunmango ·
        <a href="${baseUrl}/configuracion" style="color:#94a3b8;">Configurar alertas</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail    = process.env.RESEND_FROM  ?? 'alertas@sinunmango.com.ar'
  const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sinunmango.com.ar'

  // ── Load all active gastos fijos with user_id ────────────────────────────────
  const { data: gastosRaw, error } = await adminClient
    .from('gastos_fijos')
    .select('*, cuentas(nombre_cuenta, tipo_cuenta), categorias(nombre_categoria, icono)')
    .eq('activo', true)
    .not('dia_vencimiento', 'is', null)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const gastos = (gastosRaw ?? []) as unknown as GastoFijo[]

  // ── Load tarjetas activas con vencimiento (cuentas tipo Tarjeta Credito).
  // El día de venc lo extraemos del DATE como hace el resto de la app.
  // (TODO: cuando migremos a fechas exactas por ciclo, este parseo sale.)
  const { data: tarjetasRaw, error: errTj } = await adminClient
    .from('cuentas')
    .select('id, user_id, nombre_cuenta, fecha_vencimiento_tarjeta')
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('activa', true)
    .not('fecha_vencimiento_tarjeta', 'is', null)

  if (errTj) return NextResponse.json({ ok: false, error: errTj.message }, { status: 500 })
  const tarjetas = (tarjetasRaw ?? []) as TarjetaParaAlerta[]

  if (gastos.length === 0 && tarjetas.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No hay vencimientos activos.' })
  }

  // ── Load user preferences for all relevant users ─────────────────────────────
  const userIds = [
    ...new Set([
      ...gastos.map(g => g.user_id),
      ...tarjetas.map(t => t.user_id),
    ]),
  ]

  const { data: prefsRaw } = await adminClient
    .from('user_preferences')
    .select('user_id, alerta_vencimientos_activa, alerta_vencimientos_dias')
    .in('user_id', userIds)

  const prefsMap = new Map<string, UserPreferences>()
  for (const p of (prefsRaw ?? []) as UserPreferences[]) {
    prefsMap.set(p.user_id, p)
  }

  // Default prefs if no row exists
  const getPrefs = (userId: string): UserPreferences => prefsMap.get(userId) ?? {
    user_id:                     userId,
    alerta_vencimientos_activa:  true,
    alerta_vencimientos_dias:    [0, 1, 3],
  }

  // ── Load user emails ──────────────────────────────────────────────────────────
  // Paralelizamos getUserById — antes era secuencial, agregaba ~100-300ms
  // por user. Con Promise.allSettled corren en paralelo y errores
  // individuales no rompen el batch.
  const emailFallback = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'
  const userEmailMap = new Map<string, string>()
  const emailResults = await Promise.allSettled(
    userIds.map(uid => adminClient.auth.admin.getUserById(uid).then(r => ({ uid, email: r.data.user?.email })))
  )
  for (const r of emailResults) {
    if (r.status === 'fulfilled' && r.value.email) {
      userEmailMap.set(r.value.uid, r.value.email)
    }
  }

  // ── Build per-user alert sets ─────────────────────────────────────────────────
  const hoy    = new Date()
  const diaHoy = hoy.getDate()

  const results: { user: string; sent: boolean; count: number }[] = []
  let totalSent = 0

  for (const uid of userIds) {
    const prefs   = getPrefs(uid)
    if (!prefs.alerta_vencimientos_activa) continue

    const alertarEn = prefs.alerta_vencimientos_dias

    const userGastos: AlertaItem[] = gastos
      .filter(g => g.user_id === uid && g.dia_vencimiento !== null)
      .map<AlertaItem>(g => {
        const exact = g.dia_vencimiento! - diaHoy
        return { kind: 'gasto_fijo', gasto: g, diasRestantes: exact >= 0 ? exact : -1 }
      })
      .filter(item => alertarEn.includes(item.diasRestantes))

    const userTarjetas: AlertaItem[] = tarjetas
      .filter(t => t.user_id === uid && t.fecha_vencimiento_tarjeta)
      .map<AlertaItem>(t => {
        // El DATE viene como YYYY-MM-DD. Tomamos solo el DAY: la lógica de la
        // app trata el venc como "día del mes". Mismo enfoque que gastos fijos.
        const diaVenc = new Date(t.fecha_vencimiento_tarjeta! + 'T12:00:00').getDate()
        const exact   = diaVenc - diaHoy
        return { kind: 'tarjeta', tarjeta: t, diaVenc, diasRestantes: exact >= 0 ? exact : -1 }
      })
      .filter(item => alertarEn.includes(item.diasRestantes))

    const items: AlertaItem[] = [...userGastos, ...userTarjetas]

    if (items.length === 0) {
      results.push({ user: uid, sent: false, count: 0 })
      continue
    }

    // Nombres legibles para el subject (gasto.nombre_gasto o tarjeta.nombre_cuenta)
    const nombreOf = (i: AlertaItem) =>
      i.kind === 'gasto_fijo' ? i.gasto.nombre_gasto : i.tarjeta.nombre_cuenta

    if (!resendApiKey) {
      console.log(`[alertas-vencimientos] RESEND_API_KEY no configurada. User ${uid}:`, items.map(nombreOf))
      results.push({ user: uid, sent: false, count: items.length })
      continue
    }

    const toEmail = userEmailMap.get(uid) ?? emailFallback
    const html    = buildEmailHtml(items, baseUrl)
    const hoyItems = items.filter(p => p.diasRestantes === 0)
    const subject = hoyItems.length > 0
      ? `🔴 Vencen HOY: ${hoyItems.map(nombreOf).join(', ')}`
      : `⏰ Vencimientos próximos: ${items.map(nombreOf).slice(0, 2).join(', ')}${items.length > 2 ? ' y más' : ''}`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, html }),
    })

    if (!emailRes.ok) {
      const body = await emailRes.text()
      console.error(`[alertas-vencimientos] Resend error for ${uid}:`, body)
      results.push({ user: uid, sent: false, count: items.length })
    } else {
      results.push({ user: uid, sent: true, count: items.length })
      totalSent++
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent, results })
}
