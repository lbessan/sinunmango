'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { ShareAccountModal } from './share-account-modal'

// ─── ShareAccountTrigger ────────────────────────────────────────────────────
//
// Variant del botón compartir styled para el header colorado del detalle
// de cuenta. Usa el mismo look-and-feel que los botones Editar / Eliminar
// (background semi-transparente + texto adaptable al color del banner).

export function ShareAccountTrigger({
  cuentaId, cuentaNombre, textColor,
}: {
  cuentaId:     string
  cuentaNombre: string
  textColor:    string  // 'white' | '#1e293b' según contraste del color
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        style={{ background: 'rgba(255,255,255,0.18)', color: textColor }}
        aria-label={`Compartir ${cuentaNombre}`}
      >
        <Share2 size={13} />
        Compartir
      </button>

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
