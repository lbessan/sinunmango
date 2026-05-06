import { useEffect, useRef, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, router } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storeSession } from '@/lib/session-store'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { ThemeProvider } from '@/context/ThemeContext'

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  const navigated = useRef(false)

  const navigate = (session: Session | null) => {
    if (navigated.current) return
    navigated.current = true
    if (session) {
      router.replace('/(tabs)/dashboard')
    } else {
      router.replace('/(auth)/login')
    }
  }

  useEffect(() => {
    // Timeout de seguridad: si getSession tarda más de 4s, ir al login
    const timeout = setTimeout(() => {
      setReady(true)
      navigate(sessionRef.current)
    }, 4000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      sessionRef.current = session
      storeSession(session)
      setReady(true)
      navigate(session)
    }).catch(() => {
      clearTimeout(timeout)
      setReady(true)
      navigate(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      storeSession(session)
      sessionRef.current = session
      if (ready) {
        navigated.current = false
        navigate(session)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Handle deep-link OAuth callback
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url.includes('access_token=') && !url.includes('refresh_token=') && !url.includes('code=')) return

      const hashPart  = url.includes('#') ? url.split('#')[1] : ''
      const queryPart = url.includes('?') ? url.split('?')[1]?.split('#')[0] : ''
      const params    = new URLSearchParams(hashPart || queryPart)

      const access_token  = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      const code          = params.get('code')

      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (!error && data.session) storeSession(data.session)
      } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.session) storeSession(data.session)
      }
    }

    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }) })
    return () => sub.remove()
  }, [])

  // Mientras carga, mostrar pantalla azul con spinner (en vez de splash colgado)
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#07192b', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    )
  }

  return (
    <ThemeProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="nuevo-modal"
          options={{
            presentation: 'transparentModal',
            animation:    'slide_from_bottom',
            headerShown:  false,
          }}
        />
        <Stack.Screen
          name="perfil-modal"
          options={{
            presentation: 'modal',
            animation:    'slide_from_bottom',
            headerShown:  false,
          }}
        />
      </Stack>
    </ThemeProvider>
  )
}
