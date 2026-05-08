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

  // Intercambiar código por sesión
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !session?.user) {
    console.error('[auth/callback] Error:', error?.message)
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const user = session.user

  // ── Allowlist: verificar que el email esté permitido ─────────────────
  // Configurar ALLOWED_EMAILS en Vercel con emails separados por coma.
  // Ejemplo: luchobessan@gmail.com,amigo@gmail.com
  // Si la variable no existe o está vacía, NADIE puede entrar (closed beta).
  if (!isEmailAllowed(user.email ?? '')) {
    console.warn('[auth/callback] Email no permitido:', user.email)
    return NextResponse.redirect(new URL('/login?error=not_authorized', request.url))
  }

  // ── Leer perfil existente ────────────────────────────────────────────
  const { data: existing } = await adminClient
    .from('user_profiles')
    .select('authorized')
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    // ── USUARIO NUEVO: crear perfil + sembrar datos por defecto ─────────
    const { error: insertError } = await adminClient
      .from('user_profiles')
      .insert({ user_id: user.id, email: user.email ?? '', authorized: true })

    if (insertError) {
      console.error('[auth/callback] Error creando perfil:', insertError.message)
      return NextResponse.redirect(new URL('/login?error=auth', request.url))
    }

    await seedDefaultCategories(user.id)

    // Redirigir a onboarding para que configure su primera cuenta
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // ── USUARIO EXISTENTE: verificar autorización ────────────────────────
  if (!existing.authorized) {
    return NextResponse.redirect(new URL('/login?error=not_authorized', request.url))
  }

  // Si el usuario nunca completó el onboarding (no tiene cuentas), mandarlo ahí
  const { count } = await adminClient
    .from('cuentas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (!count || count === 0) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}

// ── Email allowlist ───────────────────────────────────────────────────────────
// Lee ALLOWED_EMAILS del entorno. Soporta emails exactos y dominios (@empresa.com).
function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? ''
  if (!raw.trim()) return false // sin variable = cerrado
  const allowed = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const lower   = email.toLowerCase()
  return allowed.some(entry =>
    entry.startsWith('@') ? lower.endsWith(entry) : lower === entry
  )
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
