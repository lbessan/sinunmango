'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { ShareWorkspaceModal } from './share-workspace-modal'

// ─── ShareWorkspaceTrigger ──────────────────────────────────────────────────
//
// Botón "Compartir workspace" + modal. Usado en /configuracion para que
// el owner invite a alguien con picker de recursos.

export function ShareWorkspaceTrigger({ variant = 'card' }: { variant?: 'card' | 'inline' }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'card' ? (
        <button onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white font-semibold transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
          <Share2 size={16} />
          Compartir mi workspace
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900">
          <Share2 size={14} /> Compartir
        </button>
      )}

      {open && <ShareWorkspaceModal onClose={() => setOpen(false)} />}
    </>
  )
}
