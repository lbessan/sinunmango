// ─── lib/workspace.ts ────────────────────────────────────────────────────────
//
// "Workspace" en sinunmango es el conjunto de datos de un user (owner).
// Un user puede estar en MÚLTIPLES workspaces:
//   - Su propio workspace (own)
//   - Workspaces ajenos donde fue invitado vía un share aceptado
//
// La cookie `current_workspace_id` define en cuál workspace estoy viendo
// la app en este momento. Default = mi propio workspace.
//
// Server components (dashboard, cuentas, movimientos) llaman a
// getCurrentWorkspace() para saber qué user_id usar como filtro de queries.
//
// Diseño:
//   - getCurrentWorkspace() siempre devuelve algo válido (nunca tira).
//   - Si la cookie apunta a un workspace al que YA NO tengo acceso
//     (share revocado/expirado/borrado), silenciosamente cae a own.
//   - Si soy own, queries usan auth.uid() como ahora.
//   - Si soy invitee, queries usan workspace.ownerUserId y dependen de
//     RLS para que solo me devuelvan recursos compartidos.

import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export const WORKSPACE_COOKIE = 'current_workspace_id'

export type WorkspaceRole = 'viewer' | 'editor'

export type Workspace = {
  /** user_id del dueño del workspace (yo si isOwn, otro si es shared) */
  ownerUserId: string
  /** True si es mi propio workspace */
  isOwn: boolean
  /** Email del owner (para mostrar "Estás viendo el workspace de X") */
  ownerEmail?: string | null
  /** Si NO es propio: mi rol en este workspace */
  role?: WorkspaceRole
  /** Si NO es propio: IDs de los recursos compartidos conmigo */
  resources?: {
    cuentas:     Set<string>
    gastosFijos: Set<string>
    inversiones: Set<string>
  }
}

/**
 * Devuelve el workspace activo del user actual.
 *
 * - Lee la cookie current_workspace_id (server-side).
 * - Si la cookie está vacía o coincide con my user_id → my own workspace.
 * - Si apunta a otro user, valida que tenga un share aceptado activo.
 *   Si no, fallback a my own (no tira error).
 *
 * Requiere `userId` del caller — el componente que llama ya tiene el user
 * autenticado, así no duplicamos el getAuthedClient.
 */
export async function getCurrentWorkspace(userId: string): Promise<Workspace> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(WORKSPACE_COOKIE)?.value

  // Default: own workspace
  if (!cookieValue || cookieValue === userId) {
    return { ownerUserId: userId, isOwn: true }
  }

  // Validar que tengamos shares activos con este owner.
  // Usamos admin client porque shares puede no estar en RLS scope del user
  // (cuando un share está revoked o expired, RLS oculta esa fila).
  const { data: shares } = await adminClient
    .from('shares')
    .select('id, role')
    .eq('owner_user_id',  cookieValue)
    .eq('invitee_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)

  if (!shares || shares.length === 0) {
    // Cookie apunta a un workspace ya no accesible → fallback a own.
    return { ownerUserId: userId, isOwn: true }
  }

  // Agregar resources de TODOS los shares activos con este owner.
  // (En practice habrá uno solo — unique index lo enforza — pero
  // soportamos múltiples por defensa.)
  const shareIds = shares.map(s => s.id)
  const { data: srs } = await adminClient
    .from('share_resources')
    .select('resource_type, resource_id')
    .in('share_id', shareIds)

  const cuentas     = new Set<string>()
  const gastosFijos = new Set<string>()
  const inversiones = new Set<string>()
  for (const r of srs ?? []) {
    if (r.resource_type === 'cuenta')      cuentas.add(r.resource_id)
    if (r.resource_type === 'gasto_fijo')  gastosFijos.add(r.resource_id)
    if (r.resource_type === 'inversion')   inversiones.add(r.resource_id)
  }

  // El role efectivo es editor si CUALQUIER share es editor.
  const role: WorkspaceRole = shares.some(s => s.role === 'editor') ? 'editor' : 'viewer'

  // Email del owner (para banner UI). Cache miss tolerable, no es crítico.
  let ownerEmail: string | null = null
  try {
    const { data: { user: u } } = await adminClient.auth.admin.getUserById(cookieValue)
    ownerEmail = u?.email ?? null
  } catch {
    // ignorar
  }

  return {
    ownerUserId: cookieValue,
    isOwn:       false,
    ownerEmail,
    role,
    resources: { cuentas, gastosFijos, inversiones },
  }
}

/**
 * Lista los workspaces accesibles para el user — el propio + cada owner
 * con quien tenga un share activo. Usado por el switcher en el sidebar.
 */
export async function listAccessibleWorkspaces(userId: string, userEmail?: string): Promise<Array<{
  ownerUserId: string
  ownerEmail:  string | null
  isOwn:       boolean
}>> {
  const result: Array<{ ownerUserId: string; ownerEmail: string | null; isOwn: boolean }> = [
    { ownerUserId: userId, ownerEmail: userEmail ?? null, isOwn: true },
  ]

  // Buscar shares activos donde soy invitee
  const { data: shares } = await adminClient
    .from('shares')
    .select('owner_user_id')
    .eq('invitee_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)

  const ownerIds = Array.from(new Set((shares ?? []).map(s => s.owner_user_id)))

  for (const ownerId of ownerIds) {
    if (ownerId === userId) continue   // skip self (shouldn't happen but defensive)
    let email: string | null = null
    try {
      const { data: { user: u } } = await adminClient.auth.admin.getUserById(ownerId)
      email = u?.email ?? null
    } catch {
      // ignorar
    }
    result.push({ ownerUserId: ownerId, ownerEmail: email, isOwn: false })
  }

  return result
}

/**
 * Helper para setear la cookie del workspace activo.
 * Llamado desde el API route /api/workspace/switch.
 */
export async function setWorkspaceCookie(ownerUserId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(WORKSPACE_COOKIE, ownerUserId, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   60 * 60 * 24 * 365,   // 1 año
    path:     '/',
  })
}

/**
 * Helper para limpiar la cookie (vuelve a my own workspace).
 */
export async function clearWorkspaceCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_COOKIE)
}
