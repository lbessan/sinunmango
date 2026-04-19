import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes (incl. OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return // still loading

    SplashScreen.hideAsync()

    if (session) {
      router.replace('/(tabs)/manguito')
    } else {
      router.replace('/(auth)/login')
    }
  }, [session])

  // Handle deep-link OAuth callback (Android: el browser externo redirige a exp://...)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      // Supabase puede devolver tokens en el hash (#access_token=...) o como query (?code=...)
      if (
        url.includes('access_token=') ||
        url.includes('refresh_token=') ||
        url.includes('code=')
      ) {
        // getSessionFromUrl acepta tanto el hash como el query string
        const { error } = await supabase.auth.getSessionFromUrl({ url })
        if (error) console.error('[OAuth] getSessionFromUrl error:', error.message)
      }
    }

    const sub = Linking.addEventListener('url', handleUrl)
    // También revisar el URL inicial (app abierta directamente desde el deep link)
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }) })

    return () => sub.remove()
  }, [])

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
