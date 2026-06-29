'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Check, AlertTriangle } from 'lucide-react'

// Botón para recalcular periodo_tarjeta de las compras no conciliadas de una
// tarjeta con sus fechas actuales. Útil tras corregir las fechas de cierre/
// vencimiento (reordena compras que quedaron en el ciclo equivocado).
export function RecalcularPeriodosButton({ cuentaId }: { cuentaId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const onClick = async () => {
    setLoading(true); setError(null); setDone(null)
    try {
      const res = await fetch(`/api/tarjetas/${cuentaId}/recalcular-periodos`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo recalcular')
      setDone(data.actualizadas === 0
        ? 'Todo estaba en orden'
        : `${data.actualizadas} ${data.actualizadas === 1 ? 'movimiento reasignado' : 'movimientos reasignados'}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        title="Reasigna el período de las compras no conciliadas con las fechas actuales"
      >
        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Recalculando…' : 'Recalcular períodos'}
      </button>
      {done && <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><Check size={12} />{done}</span>}
      {error && <span className="text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} />{error}</span>}
    </div>
  )
}
