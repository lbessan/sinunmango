import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { adminClient } from './supabase/admin'

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

/**
 * Obtiene el usuario desde una request — soporta tanto cookies (web)
 * como Bearer token en el header Authorization (app mobile).
 */
export async function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    const { data: { user } } = await adminClient.auth.getUser(token)
    return user ?? null
  }
  return getCurrentUser()
}
