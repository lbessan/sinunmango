import { supabase } from './supabase'
import { getStoredSession } from './session-store'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

/**
 * Devuelve el access token del usuario logueado.
 * Prioridad: session-store (escrito por _layout.tsx al recibir onAuthStateChange)
 * → getSession() desde AsyncStorage como fallback.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  // Prioridad 1: sesión guardada por _layout.tsx (siempre actualizada)
  const stored = getStoredSession()
  if (stored?.access_token) {
    return { Authorization: `Bearer ${stored.access_token}` }
  }
  // Prioridad 2: AsyncStorage fallback
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
