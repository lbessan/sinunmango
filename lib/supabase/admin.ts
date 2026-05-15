import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// Cliente con service role: bypassea RLS por diseno. Usar SOLO desde:
//   - Webhooks que no tienen sesion de usuario (Google Play, Resend)
//   - Cron jobs server-side
//   - /api/auth/callback (crea perfil antes de que la sesion exista)
//
// Todo lo demas (API routes con user logueado, server components) debe usar
// createClientForRequest o getAuthedClient para respetar RLS.
export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
