import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { decryptSecret } from '@/lib/crypto'
import { consultarMonotributo, errorEsDeCredenciales, AfipSdkError } from '@/lib/afipsdk'
import { aplicarSync, marcarErrorSync } from '@/lib/afip-sync'

// ─── Cron de re-sincronización de monotributo con AFIP ───────────────────────
// Semanal (lunes temprano, antes del cron de alertas). Para cada conexión con
// clave fiscal guardada y sana (estado 'conectado'), vuelve a consultar ARCA y
// actualiza categoría/facturación/tope/cuota — todo automático, sin que el user
// entre.
//
// Rotación de clave: AFIP obliga a cambiar la clave fiscal cada tanto. Cuando
// pasa, la guardada deja de servir. Ante un error que parece de credenciales
// marcamos la conexión en 'error' (así el cron NO vuelve a intentar con la
// clave vieja — reintentar podría bloquear la cuenta) y avisamos por email para
// que la reconecte. Los errores transitorios (ARCA caído) no cambian el estado:
// se reintenta la semana siguiente.

export const maxDuration = 60

type ConexionRow = { user_id: string; cuit: string; clave_cipher: string | null }

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const { data: rows, error } = await adminClient
    .from('afip_conexion')
    .select('user_id, cuit, clave_cipher')
    .eq('metodo', 'clave_fiscal')
    .eq('estado', 'conectado')
    .not('clave_cipher', 'is', null)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const conexiones = (rows ?? []) as ConexionRow[]
  if (conexiones.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: 'Nada para sincronizar.' })
  }

  const results: { user: string; ok: boolean; auth?: boolean; detalle?: string }[] = []
  let synced = 0

  for (const c of conexiones) {
    const clave = c.clave_cipher ? decryptSecret(c.clave_cipher) : null
    if (!clave) {
      // No es error de AFIP (falta la key de encriptación o se corrompió el dato).
      console.error(`[afip-sync] no se pudo descifrar la clave del user ${c.user_id}`)
      results.push({ user: c.user_id, ok: false, detalle: 'clave no descifrable' })
      continue
    }

    try {
      const snap = await consultarMonotributo({ cuit: c.cuit, clave }, { timeoutMs: 50_000, intervalMs: 5_000 })
      await aplicarSync(adminClient, c.user_id, snap)
      synced++
      results.push({ user: c.user_id, ok: true })
    } catch (e) {
      const msg = (e as AfipSdkError).message || 'Error de sincronización'
      const esAuth = errorEsDeCredenciales(msg)
      if (esAuth) {
        // Frenar la sync automática y avisar — no reintentar con clave vieja.
        await marcarErrorSync(adminClient, c.user_id, msg)
        await avisarClaveVencida(c.user_id)
      } else {
        // Transitorio: dejar registro pero seguir 'conectado' para reintentar.
        await adminClient.from('afip_conexion').update({ sync_error: msg.slice(0, 500) }).eq('user_id', c.user_id)
      }
      results.push({ user: c.user_id, ok: false, auth: esAuth, detalle: msg })
    }
  }

  return NextResponse.json({ ok: true, synced, results })
}

/** Email avisando que la clave fiscal dejó de funcionar (probable rotación). */
async function avisarClaveVencida(userId: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sinunmango.com.ar'
  if (!resendApiKey) {
    console.log(`[afip-sync] clave fiscal vencida para user ${userId} (RESEND_API_KEY no configurada)`)
    return
  }
  const fromEmail = process.env.RESEND_FROM ?? 'alertas@sinunmango.com.ar'
  let toEmail = process.env.ALERT_EMAIL ?? 'luchobessan@gmail.com'
  try {
    const { data: { user } } = await adminClient.auth.admin.getUserById(userId)
    if (user?.email) toEmail = user.email
  } catch { /* usa fallback */ }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0d2137,#1B3A6B);padding:24px 28px;">
      <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">sinunmango · monotributo</p>
      <p style="margin:6px 0 0;color:white;font-size:20px;font-weight:700;">Reconectá tu clave fiscal</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">
        No pudimos sincronizar tu monotributo con AFIP: tu <b>clave fiscal</b> dejó de funcionar. Casi siempre
        es porque AFIP te obligó a <b>cambiarla</b>.
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">
        Pausamos la sincronización automática para no arriesgar un bloqueo de tu cuenta. Entrá y volvé a
        conectar con tu clave nueva — son 10 segundos.
      </p>
    </div>
    <div style="padding:0 28px 24px;text-align:center;">
      <a href="${baseUrl}/configuracion/monotributo/conectar" style="display:inline-block;background:linear-gradient(135deg,#1B3A6B,#1a6b5a);color:white;font-size:13px;font-weight:600;padding:11px 24px;border-radius:10px;text-decoration:none;">
        Reconectar AFIP →
      </a>
    </div>
  </div>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [toEmail], subject: '🔑 Reconectá tu clave fiscal en sinunmango', html }),
  }).catch(err => console.error(`[afip-sync] Resend error avisando a ${userId}:`, err))
}
