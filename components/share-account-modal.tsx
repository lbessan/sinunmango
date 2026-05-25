'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Copy, Trash2, Link as LinkIcon, ShieldCheck, Eye } from 'lucide-react'

// ─── ShareAccountModal ──────────────────────────────────────────────────────
//
// Modal de compartir una cuenta. Lo abre el owner desde el detalle de cuenta.
// Funciones:
//   - Lista shares activos (pending + accepted) de esta cuenta
//   - Permite generar nuevo share con role picker (viewer | editor)
//   - Después de generar, muestra el invite_url con botón "Copiar"
//   - Permite revocar shares existentes
//
// Portal a document.body para escapar de cualquier stacking context.

type Share = {
  id:             string
  cuenta_id:      string
  cuenta_nombre:  string | null
  invite_token:   string
  role:           'viewer' | 'editor'
  invited_at:     string
  expires_at:     string
  accepted_at:    string | null
  revoked_at:     string | null
  invitee_email:  string | null
  status:         'pending' | 'active' | 'expired' | 'revoked'
}

export function ShareAccountModal({
  cuentaId, cuentaNombre, onClose,
}: {
  cuentaId:     string
  cuentaNombre: string
  onClose:      () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [shares, setShares]     = useState<Share[]>([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [role, setRole]         = useState<'viewer'|'editor'>('editor')
  const [newShare, setNewShare] = useState<{ url: string; role: string } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  const loadShares = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/account-shares')
      if (!res.ok) {
        setError('No pudimos cargar los shares.')
        setShares([])
        return
      }
      const data = await res.json() as { shares: Share[] }
      // Filtrar por cuenta_id del lado del cliente (el endpoint trae todos
      // los outgoing del user — chico → no es ineficiente).
      setShares(data.shares.filter(s => s.cuenta_id === cuentaId))
    } catch {
      setError('Error de conexión.')
    } finally {
      setLoading(false)
    }
  }, [cuentaId])

  useEffect(() => { void loadShares() }, [loadShares])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    setNewShare(null)
    setCopied(false)
    try {
      const res = await fetch('/api/account-shares', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cuenta_id: cuentaId, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'requires_pro') {
          setError('Compartir cuentas es una feature Pro. Pasate a Pro para invitar gente.')
        } else {
          setError(data.error ?? 'No pudimos generar el link.')
        }
        return
      }
      setNewShare({ url: data.invite_url, role: data.role })
      await loadShares()
    } catch {
      setError('Error de conexión.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(shareId: string) {
    if (!confirm('¿Revocar este acceso? La otra persona pierde acceso inmediatamente.')) return
    try {
      const res = await fetch(`/api/account-shares/${shareId}`, { method: 'DELETE' })
      if (!res.ok) {
        setError('No pudimos revocar el acceso.')
        return
      }
      await loadShares()
    } catch {
      setError('Error de conexión.')
    }
  }

  function copyLink(url: string) {
    void navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!mounted) return null

  // Filter visible shares: pending o active. No mostramos revoked/expired
  // (queda menos ruido en la UI).
  const visibleShares = shares.filter(s => s.status === 'pending' || s.status === 'active')

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Compartir cuenta</h2>
            <p className="text-sm text-slate-500 mt-0.5">{cuentaNombre}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"
                  aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        {/* Generate new share */}
        <div className="p-6 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800 mb-3">Invitar a alguien</p>

          {/* Role picker */}
          <div className="space-y-2 mb-4">
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              role === 'editor' ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:bg-slate-50'
            }`}>
              <input type="radio" name="role" value="editor" checked={role === 'editor'}
                     onChange={() => setRole('editor')} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Colaborador
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ve todo + puede cargar movimientos en esta cuenta.
                </p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              role === 'viewer' ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
            }`}>
              <input type="radio" name="role" value="viewer" checked={role === 'viewer'}
                     onChange={() => setRole('viewer')} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                  <Eye size={14} /> Solo ver
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ve movimientos + saldo, pero no puede cargar.
                </p>
              </div>
            </label>
          </div>

          {/* Generate button or link display */}
          {!newShare && (
            <button onClick={handleCreate} disabled={creating}
                    className="w-full px-5 py-3 rounded-xl text-white font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
              {creating ? 'Generando link...' : 'Generar link de invitación'}
            </button>
          )}

          {newShare && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-1.5">
                <Check size={16} /> Link listo. Copiá y compartí.
              </p>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2.5">
                <LinkIcon size={14} className="text-slate-400 shrink-0" />
                <code className="text-xs text-slate-700 truncate flex-1">{newShare.url}</code>
                <button onClick={() => copyLink(newShare.url)}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800">
                  {copied ? '¡Copiado!' : <><Copy size={12} className="inline mr-1" />Copiar</>}
                </button>
              </div>
              <p className="text-xs text-emerald-700 mt-2">
                Expira en 7 días si no la aceptan.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Active shares list */}
        <div className="p-6">
          <p className="text-sm font-semibold text-slate-800 mb-3">
            Compartido con {visibleShares.length === 0 ? 'nadie' : `${visibleShares.length} persona${visibleShares.length === 1 ? '' : 's'}`}
          </p>

          {loading && (
            <p className="text-sm text-slate-400">Cargando...</p>
          )}

          {!loading && visibleShares.length === 0 && (
            <p className="text-sm text-slate-400">
              Aún nadie tiene acceso. Generá un link arriba para invitar.
            </p>
          )}

          {!loading && visibleShares.length > 0 && (
            <ul className="space-y-2">
              {visibleShares.map(share => (
                <li key={share.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                    {(share.invitee_email ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {share.invitee_email ?? 'Pendiente de aceptar'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {share.role === 'editor' ? 'Colaborador' : 'Solo ver'} ·{' '}
                      {share.status === 'pending'
                        ? `Vence ${formatDate(share.expires_at)}`
                        : share.accepted_at && `Aceptado ${formatDate(share.accepted_at)}`}
                    </p>
                  </div>
                  <button onClick={() => handleRevoke(share.id)}
                          className="text-slate-400 hover:text-red-500 p-1.5"
                          aria-label="Revocar acceso">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric', month: 'short',
    })
  } catch {
    return ''
  }
}
