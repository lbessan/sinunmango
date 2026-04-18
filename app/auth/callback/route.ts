import { createServerClient } from '@supabase/ssr'
import { adminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

  // Exchange OAuth code for session
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session?.user) {
    console.error('[auth/callback] Error:', error?.message)
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const user = session.user

  // ── Upsert user profile (crea el perfil si es la primera vez) ──────
  // El trigger de Supabase también lo hace, pero este upsert garantiza
  // que exista incluso si el trigger falló o fue deshabilitado.
  await adminClient
    .from('user_profiles')
    .upsert(
      { user_id: user.id, email: user.email ?? '', authorized: true },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )

  // ── Verificar si el usuario está autorizado ─────────────────────────
  const { data: profile } = await adminClient
    .from('user_profiles')
    .select('authorized')
    .eq('user_id', user.id)
    .single()

  if (!profile?.authorized) {
    // Redirigir a página de acceso denegado
    return NextResponse.redirect(new URL('/login?error=not_authorized', request.url))
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
