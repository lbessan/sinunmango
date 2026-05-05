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
    const appUrl  = params.get('app')   // ej: sinunmango://auth-callback
    const hash    = window.location.hash // flujo implícito: #access_token=...
    const code    = params.get('code')   // flujo PKCE: ?code=...

    if (appUrl && hash) {
      // Flujo implícito: tokens en el hash → los pasamos a la app
      setStatus('redirecting')
      window.location.href = `${appUrl}${hash}`
    } else if (appUrl && code) {
      // Flujo PKCE: código en query string → lo pasamos a la app
      setStatus('redirecting')
      window.location.href = `${appUrl}?code=${code}`
    } else {
      // Flujo web puro
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
