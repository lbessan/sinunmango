import type { Session } from '@supabase/supabase-js'

// Almacén de sesión en memoria compartido entre _layout.tsx y api.ts.
// _layout.tsx escribe acá (porque es el primero en cargar y recibir la sesión).
// api.ts lee de acá para armar el header Authorization.
let _session: Session | null = null

export function storeSession(s: Session | null) {
  _session = s
}

export function getStoredSession(): Session | null {
  return _session
}
