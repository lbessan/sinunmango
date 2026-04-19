import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

// Guardamos la sesión en memoria apenas onAuthStateChange dispara.
// Esto es más confiable que getSession() cuando setSession() fue llamado
// desde el deep-link handler, ya que la escritura en AsyncStorage puede
// estar pendiente al momento de la primera llamada a la API.
let _cachedSession: Session | null = null
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedSession = session
})

/**
 * Devuelve el access token del usuario logueado.
 * Se pasa como Bearer token en las llamadas a los API routes de la web.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  // Prioridad 1: sesión en memoria (actualizada por onAuthStateChange)
  if (_cachedSession?.access_token) {
    return { Authorization: `Bearer ${_cachedSession.access_token}` }
  }
  // Prioridad 2: getSession() desde AsyncStorage
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

/**
 * POST a un API route con auth automática.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${API_BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body:    JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`)
  return data as T
}
