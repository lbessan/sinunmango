import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Leídas desde process.env al build time (Expo reemplaza estas refs en el
// bundle). Configuradas en eas.json para builds de producción.
// Para `expo start` local crear `.env.local` con las mismas vars.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabase] Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
    'Production builds: configurarlas en eas.json (build.production.env).\n' +
    'Dev local: crear sinunmango-mobile/.env.local con esas vars.',
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
})
