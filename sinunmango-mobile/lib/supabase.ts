import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL      = 'https://zlxoqzyabbzwfmpngusk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpseG9xenlhYmJ6d2ZtcG5ndXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTg2NDIsImV4cCI6MjA5MTMzNDY0Mn0.lMr99UMO8YazUx3qQA0rAFqxDeQ44hWLjneyTg4GgvM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
})
