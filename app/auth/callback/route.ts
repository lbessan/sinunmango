import { createServerClient } from '@supabase/ssr'
import { adminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /auth/callback ──────────────────────────────────────────────────────
// Se llama después del OAuth de Google. Intercambia el código por sesión y
// redirige al dashboard u onboarding.
//
// La creación del perfil + seed de categorías default ahora vive en el trigger
// SQL `handle_new_user` (ver docs/migration-seed-categorias-en-trigger.sql).
// El trigger es atómico: corre una sola vez por user en la transacción que
// crea auth.users. Esto elimina la race condition que existía cuando este
// callback hacía el seed en JavaScript (podía duplicar si se llamaba múltiples
// veces antes que el trigger terminara).
//
// Nota: usa adminClient (service role) porque corre ANTES de que la sesión
// esté completamente establecida — el query a cuentas tiene que pasar por
// encima de RLS para detectar si el user completó el onboarding o no.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()              { return cookieStore.getAll() },
        setAll(cookiesToSet)  { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  // Intercambiar código por sesión
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !session?.user) {
    console.error('[auth/callback] Error:', error?.message)
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const user = session.user

  // ── Si el user no tiene cuentas (onboarding incompleto), mandar a onboarding
  // El user_profiles + categorías default ya fueron creadas por el trigger
  // handle_new_user cuando se insertó la fila en auth.users.
  const { count } = await adminClient
    .from('cuentas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (!count || count === 0) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
