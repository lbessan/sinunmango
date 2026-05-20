'use client'

// ─── AccountActions — sección "Tu cuenta" en /configuracion ──────────────────
//
// Dos acciones críticas:
//
//   1. "Descargar mis datos" → GET /api/me/export devuelve un ZIP con CSVs
//      de todos los datos del user (perfil, cuentas, movimientos, etc.).
//      Cumple Habeas Data Art. 14 (AR) y GDPR Art. 20 (portabilidad).
//
//   2. "Eliminar mi cuenta" → abre modal con typing confirm. Al confirmar:
//      POST /api/me/delete marca user_profiles.deleted_at = NOW() y cierra
//      la sesión. El cron /api/cron/purge-deleted-users hace hard delete
//      cascade después de 30 días. Si el user vuelve a loguear dentro del
//      grace period, /api/me/restore lo recupera.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, AlertTriangle, X, Loader2, CheckCircle, Trash2 } from 'lucide-react'

export function AccountActions() {
  const router = useRouter()
  const [downloading,    setDownloading]    = useState(false)
  const [downloadError,  setDownloadError]  = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await fetch('/api/me/export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      // Stream → blob → URL → click invisible para disparar download.
      // Es el patrón estándar para descargas iniciadas por JS sin un
      // <a href> fijo (el filename viene del header Content-Disposition).
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      // Filename desde header (más confiable que adivinar la fecha local)
      const cd       = res.headers.get('content-disposition') ?? ''
      const match    = cd.match(/filename="?([^";]+)"?/)
      a.download     = match?.[1] ?? `sinunmango-export-${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revocar la URL después de un tick para que el browser haya iniciado
      // el download (algunos browsers cancelan el download si revocás antes).
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Error al descargar')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Descargar datos ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">Descargar tus datos</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Un ZIP con todos tus movimientos, cuentas, tarjetas e inversiones
            en formato CSV (Excel / Google Sheets).
          </p>
          {downloadError && (
            <p className="text-xs text-red-500 mt-2">{downloadError}</p>
          )}
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          {downloading
            ? <><Loader2 size={14} className="animate-spin" /> Generando...</>
            : <><Download size={14} /> Descargar</>
          }
        </button>
      </div>

      {/* ── Eliminar cuenta ──────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 pt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">Eliminar tu cuenta</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Borra tus datos del servicio. Tenés 30 días para recuperarla
            iniciando sesión, después la eliminación es definitiva.
          </p>
        </div>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} /> Eliminar
        </button>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onDone={() => {
            // /api/me/delete ya cerró la sesión server-side. Redirect a
            // /login con un mensaje ad-hoc para que el user vea
            // confirmación visual.
            router.push('/login?error=account_deleted')
          }}
        />
      )}
    </div>
  )
}

// ─── Modal de confirmación ────────────────────────────────────────────────────

function DeleteAccountModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone:  () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const canSubmit = confirmText === 'ELIMINAR' && !submitting

  const handleDelete = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/me/delete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirm: 'ELIMINAR' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Eliminar tu cuenta</h3>
              <p className="text-xs text-slate-400 mt-0.5">Esta acción es reversible durante 30 días.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Si eliminás tu cuenta, en <strong>30 días</strong> vamos a borrar
            permanentemente:
          </p>
          <ul className="text-sm text-slate-600 space-y-1.5 pl-1">
            <li className="flex items-start gap-2"><span className="text-slate-300 mt-1">•</span><span>Tus movimientos, cuentas y tarjetas</span></li>
            <li className="flex items-start gap-2"><span className="text-slate-300 mt-1">•</span><span>Tus gastos fijos e inversiones</span></li>
            <li className="flex items-start gap-2"><span className="text-slate-300 mt-1">•</span><span>Categorías personalizadas y configuración</span></li>
            <li className="flex items-start gap-2"><span className="text-slate-300 mt-1">•</span><span>Tu dirección de email inbound (queda libre)</span></li>
            <li className="flex items-start gap-2"><span className="text-slate-300 mt-1">•</span><span>Historial de conversaciones con Manguito</span></li>
          </ul>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Antes de eliminar, considerá descargar tus datos</strong> —
              tenés un botón "Descargar" en esta misma página. Una vez purgada
              la cuenta, no podemos recuperar la información.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Si tenés suscripción Pro:</strong> tu plan queda activo
              hasta el fin del período pagado, sin renovación automática. La
              cancelación o reembolso se gestionan desde Google Play
              (Suscripciones).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Para confirmar, escribí <strong className="text-slate-700">ELIMINAR</strong> abajo:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="ELIMINAR"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300 bg-white"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? <><Loader2 size={14} className="inline animate-spin mr-1.5" /> Eliminando...</>
              : 'Eliminar mi cuenta'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirmación post-deletion ──────────────────────────────────────────────
// Componente para mostrar en /login cuando el query param ?error=account_deleted
// está presente. (No se monta directo desde acá — lo importa el LoginPage.)

export function DeletedAccountBanner() {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
      <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-emerald-800">Tu cuenta fue eliminada</p>
        <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
          Tenés 30 días para recuperarla iniciando sesión con el mismo email.
          Después de eso, los datos se borran definitivamente.
        </p>
      </div>
    </div>
  )
}
