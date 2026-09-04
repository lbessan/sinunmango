'use client'

// Botón "Traer de AFIP": importa las Facturas C emitidas (wsfe) a la app.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CloudDownload, Loader2, AlertTriangle } from 'lucide-react'

export function TraerFacturasAfip() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  // `aviso` es el caso importante: wsfe respondió bien pero no tiene NADA,
  // porque el usuario factura desde "Comprobantes en línea". Antes eso se
  // mostraba como "Al día ✓" — una mentira que ocultó el problema meses.
  const [aviso, setAviso] = useState('')

  async function traer() {
    setLoading(true); setMsg(''); setAviso('')
    try {
      const r = await fetch('/api/monotributo/afip/importar', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo traer')
      if (j.importados > 0) {
        setMsg(`+${j.importados} nueva${j.importados === 1 ? '' : 's'}`)
        setTimeout(() => setMsg(''), 4000)
      } else if (j.aviso) {
        setAviso(j.aviso)
      } else {
        setMsg('Al día ✓')
        setTimeout(() => setMsg(''), 4000)
      }
      router.refresh()
    } catch (e) {
      setMsg((e as Error).message)
      setTimeout(() => setMsg(''), 6000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={traer}
        disabled={loading}
        title="Traer las facturas emitidas por web service desde AFIP"
        className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
        {msg || 'Traer de AFIP'}
      </button>

      {aviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setAviso('')}>
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">No hay nada para traer por acá</p>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{aviso}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Tenés dos formas de que esto sea automático: emitir tus facturas <b>desde la app</b>
              {' '}(quedan cargadas solas, con CAE), o traerlas con <b>Importar de ARCA</b>.
            </p>
            <button onClick={() => setAviso('')}
              className="w-full text-sm text-white px-4 py-2.5 rounded-lg font-medium"
              style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
