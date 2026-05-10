'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, X, AlertTriangle } from 'lucide-react'

interface DeleteButtonProps {
  /** URL del endpoint DELETE */
  endpoint: string
  /** A dónde redirigir después de eliminar (no usar junto con onSuccess) */
  redirectTo?: string
  /** Callback alternativo al redirect — para componentes que manejan su propio estado */
  onSuccess?: () => void
  /** Etiqueta del objeto que se está eliminando */
  label?: string
  /** Descripción extra en el modal */
  description?: string
  /** Variante visual */
  variant?: 'icon' | 'button'
}

export function DeleteButton({ endpoint, redirectTo, onSuccess, label = 'este elemento', description, variant = 'button' }: DeleteButtonProps) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    const res = await fetch(endpoint, { method: 'DELETE' })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'No se pudo eliminar')
      return
    }
    if (onSuccess) {
      onSuccess()
    } else if (redirectTo) {
      // replace() en lugar de push() + refresh(): si el delete se hizo desde
      // la página de detalle del item, la ruta actual ya no es válida (el item
      // no existe). replace() la sustituye en el historial. revalidatePath del
      // endpoint ya invalidó el RSC cache del destino.
      router.replace(redirectTo)
    } else {
      // Sin redirect: el DeleteButton se invocó desde una lista, refrescamos
      // la lista actual para que el item desaparezca.
      router.refresh()
    }
    setOpen(false)
  }

  return (
    <>
      {/* Trigger */}
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
          title="Eliminar"
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} />
          Eliminar
        </button>
      )}

      {/* Modal de confirmación */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-slate-300 hover:text-slate-500"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">¿Eliminar {label}?</h3>
                <p className="text-xs text-slate-400 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <p className="text-sm text-slate-500 mb-5">
              {description ?? 'El historial de movimientos se conserva, pero la cuenta quedará desactivada y no aparecerá más en la app.'}
            </p>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
