import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { storeSession } from '@/lib/session-store'

export default function AuthCallback() {
  const params = useLocalSearchParams()

  useEffect(() => {
    const handle = async () => {
      const code          = params.code as string | undefined
      const access_token  = params.access_token as string | undefined
      const refresh_token = params.refresh_token as string | undefined

      try {
        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error && data.session) storeSession(data.session)
        } else if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (!error && data.session) storeSession(data.session)
        }
      } catch (e) {
        console.error('[auth-callback] error:', e)
      }

      router.replace('/(tabs)/dashboard')
    }

    handle()
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: '#07192b', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#f97316" />
    </View>
  )
}
