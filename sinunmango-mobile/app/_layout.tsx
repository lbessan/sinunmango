import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storeSession } from '@/lib/session-store'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { ThemeProvider } from '@/context/ThemeContext'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    // Initial session check — también guardamos en el store para que api.ts
    // tenga el token disponible antes de que dispare onAuthStateChange
    supabase.auth.getSession().then(({ data: { session } }) => {
      storeSession(session)
      setSession(session)
    })

    // Listen for auth changes (incl. OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      storeSession(session)   // guardar en store compartido para api.ts
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return // still loading

    SplashScreen.hideAsync()

    if (session) {
      router.replace('/(tabs)/dashboard')
    } else {
      router.replace('/(auth)/login')
    }
  }, [session])

  // Handle deep-link OAuth callback (Android: el browser externo redirige a exp://...)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      // Supabase puede devolver tokens en el hash (#access_token=...) o como query (?code=...)
      if (!url.includes('access_token=') && !url.includes('refresh_token=') && !url.includes('code=')) return

      // Extraer parámetros del hash o del query string
      const hashPart  = url.includes('#') ? url.split('#')[1] : ''
      const queryPart = url.includes('?') ? url.split('?')[1]?.split('#')[0] : ''
      const params    = new URLSearchParams(hashPart || queryPart)

      const access_token  = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      const code          = params.get('code')

      if (access_token && refresh_token) {
        // Flujo implícito: tokens en el hash
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) {
          console.error('[OAuth] setSession error:', error.message)
        } else if (data.session) {
          // Guardar explícitamente — no esperamos al evento async de onAuthStateChange
          storeSession(data.session)
          console.log('[OAuth] session stored, token:', data.session.access_token.slice(0, 20) + '...')
        }
      } else if (code) {
        // Flujo PKCE: código en el query string
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[OAuth] exchangeCodeForSession error:', error.message)
        } else if (data.session) {
          storeSession(data.session)
          console.log('[OAuth] PKCE session stored')
        }
      }
    }

    const sub = Linking.addEventListener('url', handleUrl)
    // También revisar el URL inicial (app abierta directamente desde el deep link)
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }) })

    return () => sub.remove()
  }, [])

  return (
    <ThemeProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="nuevo-modal"
          options={{
            presentation:   'transparentModal',
            animation:      'slide_from_bottom',
            headerShown:    false,
            contentStyle:   { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </ThemeProvider>
  )
}
