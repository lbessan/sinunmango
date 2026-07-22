import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { sincronizarPorCert } from '@/lib/afip/sync'
import { importarComprobantes } from '@/lib/afip/comprobantes'

// ─── Cron de re-sincronización de monotributo con AFIP (por certificado) ─────
// Semanal. Para cada conexión con certificado, vuelve a leer la categoría
// (WSAA + Constancia) directo de AFIP — sin clave fiscal ni terceros. Ante un
// error (cert vencido/revocado, servicio no habilitado) marca 'error' y avisa
// por email para reconectar; no reintenta a ciegas.

export const maxDuration = 60

type ConexionRow = { user_id: string; cert_not_after: string | null }

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const { data: rows, error } = await adminClient
    .from('afip_conexion')
    .select('user_id, cert_not_after')
    .not('cert_cipher', 'is', null)
    .eq('estado', 'conectado')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const conexiones = (rows ?? []) as ConexionRow[]
  if (conexiones.length === 0) return NextResponse.json({ ok: true, synced: 0, message: 'Nada para sincronizar.' })

  const results: { user: string; ok: boolean; detalle?: string; importadas?: number }[] = []
  let synced = 0

  for (const c of conexiones) {
    try {
      const { datos } = await sincronizarPorCert(adminClient, c.user_id)
      // Traer facturas emitidas (best-effort: un problema de wsfe no debe voltear
      // la sync de categoría, que ya funcionó).
      let importadas = 0
      try { importadas = (await importarComprobantes(adminClient, c.user_id)).importados } catch { /* wsfe opcional */ }
      synced++
      results.push({ user: c.user_id, ok: true, detalle: datos.categoria ?? undefined, importadas })
    } catch (e) {
      const msg = (e as Error).message || 'Error de sincronización'
      await adminClient.from('afip_conexion')
        .update({ estado: 'error', sync_error: msg.slice(0, 500) }).eq('user_id', c.user_id)
      await avisarReconectar(c.user_id)
      results.push({ user: c.user_id, ok: false, detalle: msg })
    }
  }

  return NextResponse.json({ ok: true, synced, results })
}

/** Email avisando que hay que reconectar el certificado (vencido/revocado/servicio). */
async function avisarReconectar(userId: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sinunmango.com.ar'
  if (!resendApiKey) {
    console.log(`[afip-sync] reconectar certificado — user ${userId} (RESEND_API_KEY no configurada)`)
    return
  }
  const fromEmail = process.env.RESEND_FROM ?? 'alertas@sinunmango.com.ar'
  let toEmail = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'
  try {
    const { data: { user } } = await adminClient.auth.admin.getUserById(userId)
    if (user?.email) toEmail = user.email
  } catch { /* usa fallback */ }

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0d2137,#1B3A6B);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">sinunmango · monotributo</p>
      <p style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;">Reconectá tu certificado de AFIP</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">
        No pudimos leer tu categoría de monotributo con tu certificado. Puede estar <b>vencido</b>, revocado, o
        faltarle el servicio de Constancia de Inscripción. Pausamos la sincronización automática.
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">Reconectá tu certificado — son un par de minutos.</p>
    </div>
    <div style="padding:0 28px 24px;text-align:center;">
      <a href="${baseUrl}/configuracion/monotributo/conectar" style="display:inline-block;background:linear-gradient(135deg,#1B3A6B,#1a6b5a);color:white;font-size:13px;font-weight:600;padding:11px 24px;border-radius:10px;text-decoration:none;">Reconectar AFIP →</a>
    </div>
  </div>
</body></html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [toEmail], subject: '🔑 Reconectá tu certificado de AFIP', html }),
  }).catch(err => console.error(`[afip-sync] Resend error avisando a ${userId}:`, err))
}
