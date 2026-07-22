'use client'

// Botón "Traer de AFIP": importa las Facturas C emitidas (wsfe) a la app.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CloudDownload, Loader2 } from 'lucide-react'

export function TraerFacturasAfip() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function traer() {
    setLoading(true); setMsg('')
    try {
      const r = await fetch('/api/monotributo/afip/importar', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo traer')
      setMsg(j.importados > 0 ? `+${j.importados} nueva${j.importados === 1 ? '' : 's'}` : 'Al día ✓')
      router.refresh()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setLoading(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }

  return (
    <button
      onClick={traer}
      disabled={loading}
      title="Traer mis facturas emitidas desde AFIP"
      className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
      {msg || 'Traer de AFIP'}
    </button>
  )
}
