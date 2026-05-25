'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { ShareAccountModal } from './share-account-modal'

// ─── ShareAccountButton ─────────────────────────────────────────────────────
//
// Botón "Compartir" para incluir en páginas server-side. Maneja el state
// del modal (open/close). El modal se renderea via portal.
//
// Variants:
//   - 'card':   botón compacto con icono + label (default — para detalle de cuenta)
//   - 'icon':   solo icono, ideal para listas donde el espacio es escaso

export function ShareAccountButton({
  cuentaId, cuentaNombre, variant = 'card',
}: {
  cuentaId:     string
  cuentaNombre: string
  variant?:     'card' | 'icon'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'card' ? (
        <button onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          <Share2 size={16} />
          Compartir
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label={`Compartir ${cuentaNombre}`}>
          <Share2 size={16} />
        </button>
      )}

      {open && (
        <ShareAccountModal
          cuentaId={cuentaId}
          cuentaNombre={cuentaNombre}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
