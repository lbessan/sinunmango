import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Image, Alert, Linking, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'

WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
  const [loading, setLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      // La app (Expo Go o standalone) tiene su URL de deep link propia.
      // Supabase no acepta exp:// confiablemente, así que usamos la web como puente:
      //   Supabase → app.sinunmango.com.ar/auth-callback?app=[appUrl] → app (deep link)
      const isExpoGo = Constants.appOwnership === 'expo'
      const appUrl = AuthSession.makeRedirectUri(
        isExpoGo
          ? { path: 'auth-callback' }                         // → exp://[ip]:8081/--/auth-callback
          : { scheme: 'sinunmango', path: 'auth-callback' }  // → sinunmango://auth-callback
      )
      const redirectUrl = `https://app.sinunmango.com.ar/auth-callback?app=${encodeURIComponent(appUrl)}`

      // Logs solo en dev: en release Android estos quedan en logcat y son
      // legibles por otras apps con permisos antiguos. Las URLs contienen
      // identificadores del bundle / scheme privado del proyecto.
      if (__DEV__) {
        console.log('[OAuth] App URL:', appUrl)
        console.log('[OAuth] Redirect URL (web bridge):', redirectUrl)
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo:          redirectUrl,
          skipBrowserRedirect: true,
        },
      })

      if (error || !data.url) {
        Alert.alert('Error', error?.message ?? 'No se pudo iniciar sesión.')
        return
      }

      if (Platform.OS === 'android') {
        // En Android, WebBrowser.openAuthSessionAsync no intercepta exp:// de vuelta.
        // Abrimos el browser directamente; el deep-link listener en _layout.tsx
        // captura el callback cuando Android devuelve la app.
        // Liberamos el loading acá porque la sesión se establece de forma asincrónica.
        setLoading(false)
        await Linking.openURL(data.url)
        return // el finally también llama setLoading(false) pero ya lo hicimos
      } else {
        // En iOS, WebBrowser captura el redirect y devuelve la URL con tokens.
        // La sesión se establece vía el listener de _layout.tsx cuando el deep link llega.
        await WebBrowser.openAuthSessionAsync(data.url, appUrl)
      }
    } catch (e) {
      Alert.alert('Error', 'Algo salió mal. Intentá de nuevo.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Logo & nombre */}
      <View style={styles.hero}>
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.brandName}>
          <Text style={{ color: Colors.white }}>sinun</Text>
          <Text style={{ color: Colors.orange }}>mango</Text>
        </Text>
        <Text style={styles.tagline}>Tu app de finanzas personales</Text>
      </View>

      {/* Login card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bienvenido de nuevo</Text>
        <Text style={styles.cardSubtitle}>
          Iniciá sesión con tu cuenta de Google para continuar
        </Text>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continuar con Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.sidebar,
    justifyContent:  'space-between',
    paddingBottom:   32,
  },
  hero: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    paddingTop:     48,
  },
  logoContainer: {
    width:           96,
    height:          96,
    borderRadius:    48,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent:  'center',
    alignItems:      'center',
    marginBottom:    20,
  },
  logo: {
    width:  72,
    height: 72,
  },
  brandName: {
    fontSize:   36,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color:    'rgba(255,255,255,0.5)',
  },
  orange: {
    color: Colors.orange,
  },
  card: {
    marginHorizontal: 24,
    backgroundColor:  Colors.bgCard,
    borderRadius:     20,
    padding:          28,
  },
  cardTitle: {
    fontSize:     22,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize:     14,
    color:        Colors.textSecondary,
    lineHeight:   20,
    marginBottom: 24,
  },
  googleButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.white,
    borderRadius:    12,
    paddingVertical: 14,
    gap:             10,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize:   18,
    fontWeight: '700',
    color:      '#4285F4',
  },
  googleButtonText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },
})
