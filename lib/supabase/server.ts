import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente Supabase desde el cookie store de Next.js.
 * Usado por server components, server actions y route handlers que solo
 * usan cookies (no Bearer). Las queries respetan RLS según auth.uid() del user.
 */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // En server components que ya devolvieron HTML, set() falla — lo ignoramos.
          }
        },
      },
    }
  )
}

/**
 * Cliente Supabase + user actual, en una sola llamada.
 *
 * Patrón estándar para server components que necesitan ambos:
 *
 *   const { supabase, user } = await getAuthedClient()
 *   if (!user) redirect('/login')
 *   const { data } = await supabase.from('cuentas').select('*').eq('user_id', user.id)
 *
 * Las queries respetan RLS — el usuario solo ve sus propias filas. El filtro
 * `.eq('user_id', user.id)` se mantiene como defensa en profundidad (RLS hace
 * lo mismo, pero explicito ayuda si alguna policy se cae o se relaja).
 *
 * Para route handlers que reciben Bearer token (mobile), usar
 * `createClientForRequest(req)` de `@/lib/supabase/route` en su lugar.
 */
export async function getAuthedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}
