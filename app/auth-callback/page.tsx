'use client'

import { useEffect, useState } from 'react'

// Esta página actúa como puente entre Supabase y la app móvil.
// Supabase redirige acá con los tokens en el hash (#access_token=...).
// Si hay un parámetro ?app=..., redirige a la URL de la app (Expo Go o standalone).
// Si no hay ?app=..., redirige al dashboard web (auth normal de la web).
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'web'>('loading')

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search)
    const appUrl  = params.get('app')   // ej: exp://192.168.68.58:8081/--/auth-callback
    const hash    = window.location.hash // ej: #access_token=...&refresh_token=...

    if (appUrl && hash) {
      // Flujo mobile: mandamos los tokens de vuelta a la app
      setStatus('redirecting')
      window.location.href = `${appUrl}${hash}`
    } else {
      // Flujo web: Supabase client-side levanta la sesión del hash automáticamente
      setStatus('web')
      window.location.href = '/'
    }
  }, [])

  return (
    <div style={{
      display:        'flex',
      height:         '100vh',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     'sans-serif',
      color:          '#334155',
      gap:            12,
    }}>
      {status === 'loading'     && <p>Procesando...</p>}
      {status === 'redirecting' && <p>Volviendo a la app...</p>}
      {status === 'web'         && <p>Redirigiendo...</p>}
    </div>
  )
}
