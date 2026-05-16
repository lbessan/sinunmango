import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storeSession } from '@/lib/session-store'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { ThemeProvider } from '@/context/ThemeContext'
import { SubscriptionProvider } from '@/context/SubscriptionContext'

export default function RootLayout() {
  const sessionRef = useRef<Session | null>(null)
  const navigated = useRef(false)

  const navigate = (session: Session | null) => {
    if (navigated.current) return
    navigated.current = true
    if (session) {
      router.replace('/(tabs)/dashboard' as never)
    } else {
      router.replace('/(auth)/login')
    }
  }

  useEffect(() => {
    // getSession() lee de AsyncStorage, no hace network — debería resolver
    // en ms. Antes había un timeout de 4s que navegaba a /login si getSession
    // demoraba — pero eso enmascaraba bugs y, peor, mandaba al user a login
    // aunque tuviera sesión persistida si el storage estaba lento. Ahora
    // dejamos que Expo muestre el splash hasta que getSession resuelva.
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionRef.current = session
      storeSession(session)
      navigate(session)
    }).catch(err => {
      console.error('[auth] getSession failed:', err)
      navigate(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Siempre actualizamos session-store y ref — el access token rotado en
      // TOKEN_REFRESHED tiene que llegar a api.ts para que las próximas
      // requests usen el token fresco.
      storeSession(session)
      sessionRef.current = session

      // Pero solo renavegamos en cambios reales del estado de auth. Antes
      // navegábamos en CADA evento (TOKEN_REFRESHED, USER_UPDATED, etc.),
      // así que cada hora — cuando Supabase refresca el token — el user
      // era teleportado al dashboard aunque estuviera escribiendo en
      // Manguito o en nuevo-modal.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
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

  return (
    <ThemeProvider>
      <SubscriptionProvider>
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
      </SubscriptionProvider>
    </ThemeProvider>
  )
}
