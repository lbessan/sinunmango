import { supabase } from './supabase'
import { getStoredSession } from './session-store'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

// Timeout default para fetches. Mobile en 3G/4G argentina puede ser lento.
// 20s es un balance: permite operaciones lentas (Claude PDF parse llega a
// ~15s) sin que el user quede esperando indefinidamente.
const DEFAULT_TIMEOUT_MS = 20_000

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
 * Helper compartido entre apiGet/apiPost. Encapsula:
 *  - timeout via AbortSignal
 *  - parse robusto (no asume JSON — si el server devuelve HTML por un 502 de
 *    Cloudflare, antes res.json() tiraba "Unexpected token <" opaco)
 *  - mensajes de error friendly para el user
 */
async function apiFetch<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const { method, body, timeoutMs = DEFAULT_TIMEOUT_MS } = init
  const authHeaders = await getAuthHeader()

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body:    body !== undefined ? JSON.stringify(body) : undefined,
      signal:  AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('La conexión tardó demasiado. Probá de nuevo.')
    }
    throw new Error('No pudimos conectar con el servidor. Verificá tu conexión.')
  }

  // Leemos como texto primero. Si el server respondió con HTML (Cloudflare
  // 502/504, Vercel error page, etc.) el JSON.parse falla con error opaco;
  // capturamos eso y damos un mensaje claro.
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!res.ok) throw new Error(`Error del servidor (${res.status})`)
      throw new Error('El servidor respondió con un formato inesperado.')
    }
  }

  if (!res.ok) {
    const errMsg = (data as { error?: string } | null)?.error ?? `Error ${res.status}`
    throw new Error(errMsg)
  }
  return data as T
}

/**
 * GET a un API route con auth automática.
 */
export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' })
}

/**
 * POST a un API route con auth automática.
 */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body })
}
