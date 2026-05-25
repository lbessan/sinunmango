'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Home, Users, Check } from 'lucide-react'

// ─── WorkspaceSwitcher ──────────────────────────────────────────────────────
//
// Dropdown en el sidebar para cambiar de workspace. Solo se muestra si
// el user tiene shares recibidos (sino: silencioso, no clutter).
//
// Al hacer click en otro workspace, llama a POST /api/workspace/switch
// y hace reload para que las queries del server tomen el nuevo workspace.

type Workspace = {
  ownerUserId: string
  ownerEmail:  string | null
  isOwn:       boolean
}

type WorkspaceData = {
  current: {
    ownerUserId: string
    isOwn:       boolean
    ownerEmail:  string | null
    role:        'viewer' | 'editor' | null
  }
  workspaces: Workspace[]
}

export function WorkspaceSwitcher() {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    void fetch('/api/workspace')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
  }, [])

  // No hay shares recibidos → no mostrar switcher
  if (!data || data.workspaces.length <= 1) return null

  async function switchTo(ownerUserId: string) {
    setSwitching(true)
    try {
      const res = await fetch('/api/workspace/switch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspace_id: ownerUserId }),
      })
      if (res.ok) {
        // Reload para que las queries del server tomen el nuevo workspace.
        window.location.reload()
      } else {
        setSwitching(false)
      }
    } catch {
      setSwitching(false)
    }
  }

  const current = data.current

  return (
    <div className="relative px-3 mb-2">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5 disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        {current.isOwn
          ? <Home size={14} className="text-white/60 shrink-0" />
          : <Users size={14} className="text-amber-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-white/40 leading-none mb-0.5">
            Workspace
          </p>
          <p className="text-sm text-white truncate">
            {current.isOwn
              ? 'Mi cuenta'
              : (current.ownerEmail ? `${current.ownerEmail.split('@')[0]}` : 'Compartido')
            }
          </p>
        </div>
        <ChevronDown size={14} className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-1 bg-white rounded-lg shadow-2xl z-50 py-1 max-h-72 overflow-y-auto">
          {data.workspaces.map(ws => {
            const isCurrent = ws.ownerUserId === current.ownerUserId
            return (
              <button
                key={ws.ownerUserId}
                onClick={() => isCurrent ? setOpen(false) : switchTo(ws.ownerUserId)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
              >
                {ws.isOwn
                  ? <Home size={14} className="text-slate-500 shrink-0" />
                  : <Users size={14} className="text-amber-600 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">
                    {ws.isOwn ? 'Mi cuenta' : (ws.ownerEmail ?? 'Compartido')}
                  </p>
                  {!ws.isOwn && (
                    <p className="text-xs text-slate-400 truncate">Workspace compartido</p>
                  )}
                </div>
                {isCurrent && <Check size={14} className="text-emerald-600 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
