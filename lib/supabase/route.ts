import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import type { Database } from '@/lib/database.types'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Devuelve un cliente Supabase autenticado como el user de la request, junto
 * con el user. Funciona para web (cookies) y mobile (Bearer JWT).
 *
 * Las queries respetan RLS - solo se ven las filas propias del user.
 */
export async function createClientForRequest(req?: NextRequest): Promise<{
  supabase: SupabaseClient<Database>
  user:     User | null
}> {
  // Bearer (mobile)
  const authHeader = req?.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createSupabaseClient<Database>(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth:   { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data: { user } } = await supabase.auth.getUser(token)
    return { supabase, user }
  }

  // Cookie (web)
  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(URL, ANON, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}
