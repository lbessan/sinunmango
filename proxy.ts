// ─── proxy.ts (Next 16: ex "middleware.ts") ──────────────────────────────────
//
// Refresca la sesión de Supabase en CADA request, ANTES de que se rendericen
// las páginas o corran los route handlers. Es un requisito del patrón SSR de
// Supabase que faltaba, y causaba 401 al importar/guardar:
//
//   El access token de Supabase vence (~1h). Los server components NO pueden
//   escribir cookies (su setAll falla y lo tragamos), así que si el token
//   vence estando en una página, NADA lo renueva — y la próxima mutación
//   (POST /api/movimientos, etc.) llega sin sesión → "No autenticado".
//
//   El caso real: parseás el resumen (auth OK), tardás unos minutos
//   categorizando, y al importar el token ya venció. Sin este refresco, se
//   perdía todo. Con el proxy, cada navegación/fetch renueva el token y
//   reescribe la cookie en la respuesta, así el browser siempre la tiene
//   fresca.
//
// Alcance deliberadamente mínimo: SOLO refresca la sesión. NO redirige ni
// bloquea — cada página/endpoint sigue decidiendo su propio auth (las páginas
// hacen `if (!user) redirect('/login')`). Así no rompe rutas públicas
// (landing, /login, /privacidad) ni webhooks.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Respuesta base: dejamos pasar el request tal cual, pero podemos pegarle
  // cookies actualizadas si Supabase refresca el token.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Escribimos las cookies refrescadas en el request (para que el
          // handler/página downstream vea la sesión nueva) Y en la response
          // (para que el browser la persista). Este es el punto que los server
          // components no pueden hacer.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() dispara el refresh si el access token está vencido. No usamos el
  // resultado: solo queremos el efecto secundario de renovar la cookie. Si no
  // hay sesión, no pasa nada (no se setea ninguna cookie) y seguimos de largo.
  try {
    await supabase.auth.getUser()
  } catch {
    // Un problema puntual de red con Supabase no debe tumbar TODA la app.
    // Seguimos con la cookie que había; el endpoint hará su propio 401 si toca.
  }

  return response
}

export const config = {
  matcher: [
    // Corre en todo, MENOS:
    //  - assets estáticos de Next (_next/static, _next/image)
    //  - favicon, manifest, service worker, robots y archivos con extensión
    //  - webhooks y crons: usan su propia auth (firma Svix / secret) y no
    //    dependen de cookies — el proxy no tiene nada que refrescar ahí.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|api/cron|api/email-inbound|api/webhooks|.*\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)',
  ],
}
