// ─── Rate limiting helper ─────────────────────────────────────────────────
//
// Llama a la función Postgres check_rate_limit() vía RPC. La función vive en
// Postgres porque Vercel es stateless entre invocaciones, así que necesitamos
// estado compartido.
//
// Uso típico en una API route:
//
//   const limit = await checkRateLimit(user.id, '/api/asistente', { max: 20, windowSeconds: 60 })
//   if (!limit.allowed) {
//     return NextResponse.json({ error: limit.message }, { status: 429 })
//   }

import { adminClient } from '@/lib/supabase/admin'

export type RateLimitResult = {
  allowed: boolean
  message: string
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
  opts: { max: number; windowSeconds: number }
): Promise<RateLimitResult> {
  const { data, error } = await adminClient.rpc('check_rate_limit', {
    p_user_id:        userId,
    p_endpoint:       endpoint,
    p_max:            opts.max,
    p_window_seconds: opts.windowSeconds,
  })

  // Si la función falla (DB caída, función no existe, etc.) preferimos no
  // bloquear al usuario — el costo de un falso positivo es peor que el
  // beneficio. Loguear y permitir.
  if (error) {
    console.error('[rate-limit] RPC error:', error.message)
    return { allowed: true, message: '' }
  }

  if (data === false) {
    return {
      allowed: false,
      message: `Demasiados pedidos. Probá de nuevo en ~${opts.windowSeconds}s.`,
    }
  }

  return { allowed: true, message: '' }
}
