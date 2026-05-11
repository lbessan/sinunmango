import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

/**
 * Cliente Supabase desde el cookie store de Next.js, tipado con Database.
 */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
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
            // En server components que ya devolvieron HTML, set() falla.
          }
        },
      },
    }
  )
}

/**
 * Cliente Supabase + user actual, en una sola llamada.
 *
 *   const { supabase, user } = await getAuthedClient()
 *   if (!user) redirect('/login')
 *
 * Las queries respetan RLS. El filtro .eq('user_id', user.id) queda como
 * defensa en profundidad.
 */
export async function getAuthedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}
