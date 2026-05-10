import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Devuelve un cliente Supabase autenticado como el user de la request, junto
 * con el user mismo. Funciona para web (cookies de sesión) y mobile (Bearer JWT).
 *
 * Las queries hechas con este cliente respetan RLS — un user solo ve y modifica
 * sus propias filas, sin necesidad de agregar filtros manuales (igual conviene
 * mantener `.eq('user_id', user.id)` como defensa en profundidad).
 *
 * Patrón típico:
 *
 *   export async function POST(req: NextRequest) {
 *     const { supabase, user } = await createClientForRequest(req)
 *     if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 *     const { error } = await supabase.from('movimientos').insert({ ..., user_id: user.id })
 *     ...
 *   }
 *
 * Routes que NO deben usar este helper (no tienen user en sesión):
 *  - /api/webhooks/google-play (notificación de Pub/Sub)
 *  - /api/email-inbound (webhook de Resend)
 *  - /api/cron/* (cron jobs server-side)
 *  - /api/auth/callback (crea perfil antes de que la sesión esté establecida)
 *
 * Esos siguen usando `adminClient` con filtros explícitos por user_id.
 */
export async function createClientForRequest(req?: NextRequest): Promise<{
  supabase: SupabaseClient
  user:     User | null
}> {
  // ── Bearer (mobile) ─────────────────────────────────────────────────────────
  const authHeader = req?.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createSupabaseClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth:   { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    // getUser(token) valida el JWT contra Supabase Auth y devuelve el user.
    // El header Authorization global hace que las queries siguientes pasen el
    // mismo token, así RLS resuelve auth.uid() correctamente.
    const { data: { user } } = await supabase.auth.getUser(token)
    return { supabase, user }
  }

  // ── Cookie (web) ────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // En route handlers que no escriben respuesta, set() puede fallar — lo ignoramos.
        }
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}
