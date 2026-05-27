import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'

// ─── Cron: purge users con soft delete vencido ────────────────────────────────
//
// Corre diariamente. Busca user_profiles con deleted_at < NOW() - 30 días
// y hace hard delete cascade:
//
//   1. supabase.auth.admin.deleteUser(id) — esto borra la fila en
//      auth.users. Las FK con ON DELETE CASCADE hacia auth.users hacen
//      el cascade automático a: user_profiles, cuentas, tarjetas,
//      movimientos, categorias, subcategorias, gastos_fijos, inversiones,
//      conciliaciones, parametros, usage_log, etc.
//
//   2. Email de confirmación final via Resend al user (a la dirección
//      registrada antes de borrar). Cierre del loop.
//
// Si Supabase no tiene la FK con CASCADE configurada para alguna tabla,
// el deleteUser va a fallar con violation de FK. Esto se detecta en logs;
// la solución es agregar la cascade en una migration aparte.
//
// La grace period es 30 días — antes de eso el user puede recuperar la
// cuenta con POST /api/me/restore.

const GRACE_DAYS = 30

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail    = process.env.RESEND_FROM ?? 'alertas@sinunmango.com.ar'

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Cargar los profiles a purgar. Tomamos email desde auth.users (via
  // adminClient.auth.admin.getUserById) para mandar el email final, pero
  // primero filtramos por la columna deleted_at en user_profiles.
  const { data: pendientes, error: errPend } = await adminClient
    .from('user_profiles')
    .select('user_id, deleted_at')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)

  if (errPend) {
    console.error('[purge-deleted-users] query error:', errPend)
    return NextResponse.json({ error: errPend.message }, { status: 500 })
  }

  if (!pendientes || pendientes.length === 0) {
    return NextResponse.json({ ok: true, purged: 0, message: 'No hay cuentas a purgar.' })
  }

  // ── PASO 1: lookup paralelo de emails ────────────────────────────────────
  // Antes hacíamos getUserById secuencial dentro del loop principal. Con N
  // users y latencia ~80ms/lookup, N=50 dejaba el cron en 4s sólo por emails.
  // Ahora corren en paralelo via Promise.allSettled (fail-safe: si uno falla,
  // los demás siguen).
  const userIds = pendientes.map(p => p.user_id)
  const emailLookups = await Promise.allSettled(
    userIds.map(uid => adminClient.auth.admin.getUserById(uid))
  )
  const emailByUserId = new Map<string, string | null>()
  emailLookups.forEach((res, i) => {
    const uid = userIds[i]
    if (res.status === 'fulfilled') {
      const { data, error } = res.value
      if (error) {
        console.warn(`[purge-deleted-users] getUserById failed for ${uid}:`, error.message)
        emailByUserId.set(uid, null)
      } else {
        emailByUserId.set(uid, data.user?.email ?? null)
      }
    } else {
      console.warn(`[purge-deleted-users] getUserById rejected for ${uid}:`, res.reason)
      emailByUserId.set(uid, null)
    }
  })

  // ── PASO 2: hard delete secuencial ───────────────────────────────────────
  // Mantengo el delete secuencial — Supabase admin API tiene rate limits y
  // un delete que casca por FK puede tirar todo si los disparamos en paralelo.
  // Si esto se vuelve un cuello de botella con miles de purges/día, podemos
  // batchear con un pool limitado (8 en paralelo, por ejemplo).
  const results: Array<{ user_id: string; status: 'purged' | 'error'; error?: string }> = []

  for (const row of pendientes) {
    const userId = row.user_id
    const userEmail = emailByUserId.get(userId) ?? null

    // Hard delete: borra de auth.users. Las FK con ON DELETE CASCADE
    // hacen el cascade automático al resto de tablas.
    const { error: delErr } = await adminClient.auth.admin.deleteUser(userId)

    if (delErr) {
      console.error(`[purge-deleted-users] delete failed for ${userId}:`, delErr.message)
      results.push({ user_id: userId, status: 'error', error: delErr.message })
      continue
    }

    results.push({ user_id: userId, status: 'purged' })

    // Email de confirmación final (best-effort, no bloquea el flow si falla).
    if (userEmail && resendApiKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    fromEmail,
            to:      userEmail,
            subject: 'Tu cuenta de sinunmango fue eliminada',
            html: confirmacionEmail(userEmail),
          }),
        })
      } catch (e) {
        console.warn(`[purge-deleted-users] email send failed for ${userEmail}:`, e)
      }
    }
  }

  const purged   = results.filter(r => r.status === 'purged').length
  const errors   = results.filter(r => r.status === 'error').length

  return NextResponse.json({ ok: true, purged, errors, results })
}

function confirmacionEmail(email: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#0d2137,#1a6b5a);padding:32px 24px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#fff;">
            <span>sinun</span><span style="color:#f97316;">mango</span>
          </div>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;">Tu cuenta fue eliminada</h2>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
            Confirmamos la eliminación de tu cuenta en sinunmango (${email}).
            Tus datos fueron borrados completamente de nuestros sistemas.
          </p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
            Lamentamos verte ir. Si en el futuro querés volver, podés crear
            una cuenta nueva con este mismo email cuando quieras.
          </p>
          <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
            Gracias por haber probado sinunmango.
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            <a href="https://app.sinunmango.com.ar" style="color:#475569;text-decoration:none;">app.sinunmango.com.ar</a>
            &nbsp;·&nbsp;
            <a href="https://app.sinunmango.com.ar/privacidad" style="color:#475569;text-decoration:none;">Política de privacidad</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`.trim()
}
