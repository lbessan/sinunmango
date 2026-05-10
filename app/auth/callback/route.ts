import { createServerClient } from '@supabase/ssr'
import { adminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /auth/callback ──────────────────────────────────────────────────────
// Se llama después del OAuth de Google. Intercambia el código por sesión,
// crea el perfil del usuario si es nuevo, y redirige al dashboard u onboarding.
//
// Nota: usa adminClient (service role) porque corre ANTES de que la sesión
// esté completamente establecida — el primer query a user_profiles tiene que
// pasar por encima de RLS para crear/leer la fila del usuario que recién entra.

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

  // ── Buscar perfil existente ──────────────────────────────────────────────
  const { data: existing } = await adminClient
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    // ── USUARIO NUEVO: crear perfil + sembrar categorías por defecto ───────
    // plan = 'free' explícito. authorized = true se conserva para mantener
    // compatibilidad con la columna existente y permitir bans manuales en el
    // futuro (`UPDATE user_profiles SET authorized = false WHERE ...`).
    const { error: insertError } = await adminClient
      .from('user_profiles')
      .insert({ user_id: user.id, email: user.email ?? '', authorized: true, plan: 'free' })

    if (insertError) {
      console.error('[auth/callback] Error creando perfil:', insertError.message)
      return NextResponse.redirect(new URL('/login?error=auth', request.url))
    }

    await seedDefaultCategories(user.id)

    // Redirigir a onboarding para que configure su primera cuenta
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // ── USUARIO EXISTENTE ────────────────────────────────────────────────────
  // Si nunca completó el onboarding (no tiene cuentas), mandarlo ahí
  const { count } = await adminClient
    .from('cuentas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (!count || count === 0) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}

// ── Categorías por defecto para usuarios nuevos ────────────────────────────
async function seedDefaultCategories(userId: string) {
  // Verificar si ya tiene categorías (idempotente: si algo falló y se llama 2 veces)
  const { count } = await adminClient
    .from('categorias')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (count && count > 0) return

  const categorias = [
    // Gastos
    { nombre_categoria: 'Supermercado',    tipo_default: 'Gasto',   icono: '🛒' },
    { nombre_categoria: 'Restaurantes',    tipo_default: 'Gasto',   icono: '🍽️' },
    { nombre_categoria: 'Transporte',      tipo_default: 'Gasto',   icono: '🚗' },
    { nombre_categoria: 'Salud',           tipo_default: 'Gasto',   icono: '🏥' },
    { nombre_categoria: 'Indumentaria',    tipo_default: 'Gasto',   icono: '👕' },
    { nombre_categoria: 'Entretenimiento', tipo_default: 'Gasto',   icono: '🎬' },
    { nombre_categoria: 'Servicios',       tipo_default: 'Gasto',   icono: '💡' },
    { nombre_categoria: 'Educación',       tipo_default: 'Gasto',   icono: '📚' },
    { nombre_categoria: 'Viajes',          tipo_default: 'Gasto',   icono: '✈️' },
    { nombre_categoria: 'Hogar',           tipo_default: 'Gasto',   icono: '🏠' },
    { nombre_categoria: 'Tecnología',      tipo_default: 'Gasto',   icono: '💻' },
    { nombre_categoria: 'Otros gastos',    tipo_default: 'Gasto',   icono: '📦' },
    // Ingresos
    { nombre_categoria: 'Sueldo',          tipo_default: 'Ingreso',  icono: '💰' },
    { nombre_categoria: 'Freelance',       tipo_default: 'Ingreso',  icono: '💼' },
    { nombre_categoria: 'Inversiones',     tipo_default: 'Ingreso',  icono: '📈' },
    { nombre_categoria: 'Otros ingresos',  tipo_default: 'Ingreso',  icono: '➕' },
  ].map(c => ({ ...c, id: crypto.randomUUID(), user_id: userId }))

  const { error } = await adminClient.from('categorias').insert(categorias)
  if (error) console.error('[seedDefaultCategories] Error:', error.message)
}
