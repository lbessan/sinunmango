import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { listAccessibleWorkspaces, getCurrentWorkspace } from '@/lib/workspace'

// ─── GET /api/workspace ──────────────────────────────────────────────────────
//
// Lista los workspaces accesibles al user + cuál es el "current".
// Usado por el switcher en el sidebar:
//
//   - own: mi propio workspace (siempre primero)
//   - guest: workspaces ajenos donde tengo share activo
//
// Si el user solo tiene su propio workspace (no recibió shares), el
// switcher se puede no mostrar — pero el endpoint sigue devolviéndolo.

export async function GET(req: NextRequest) {
  const { user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [workspaces, current] = await Promise.all([
    listAccessibleWorkspaces(user.id, user.email ?? undefined),
    getCurrentWorkspace(user.id),
  ])

  return NextResponse.json({
    current: {
      ownerUserId: current.ownerUserId,
      isOwn:       current.isOwn,
      ownerEmail:  current.ownerEmail ?? null,
      role:        current.role ?? null,
    },
    workspaces,
  })
}
