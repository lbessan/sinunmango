'use client'

// ─── AI Insight Card (Option A) ──────────────────────────────────────────────
//
// Card al inicio de Resumen. Auto-genera un párrafo + 3 highlights con AI
// sobre el período seleccionado.
// Gateado por plan Pro — free users ven un teaser con CTA.

import { useState, useEffect } from 'react'
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  Award, Target, Calendar, Lock, RefreshCw,
} from 'lucide-react'
import { type MovAnalitica } from './utils'
import { computeInsights, type InsightsResult } from './insights'
import { buildContextoNarrativa } from './insight-context'

type Highlight = {
  icon: 'trending-up' | 'trending-down' | 'alert' | 'award' | 'target' | 'calendar'
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
  text: string
}

type InsightResponse = {
  narrativa:  string
  highlights: Highlight[]
}

const ICON_MAP = {
  'trending-up':   TrendingUp,
  'trending-down': TrendingDown,
  'alert':         AlertTriangle,
  'award':         Award,
  'target':        Target,
  'calendar':      Calendar,
}

const TONE_STYLES = {
  positive: { bg: 'bg-emerald-50',  text: 'text-emerald-700', icon: 'text-emerald-500' },
  negative: { bg: 'bg-red-50',      text: 'text-red-700',     icon: 'text-red-500' },
  warning:  { bg: 'bg-amber-50',    text: 'text-amber-700',   icon: 'text-amber-500' },
  neutral:  { bg: 'bg-slate-50',    text: 'text-slate-600',   icon: 'text-slate-500' },
}

export function AIInsightCard({
  movimientos,
  desde,
  hasta,
  hasProAccess,
}: {
  movimientos:  MovAnalitica[]
  desde:        Date
  hasta:        Date
  hasProAccess: boolean
}) {
  const [result,  setResult]  = useState<InsightResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Cargar / recargar cuando cambia el período
  useEffect(() => {
    if (!hasProAccess) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)

      // Filtrar movs al período
      const movsPeriodo = movimientos.filter(m => {
        const f = new Date(m.fecha + 'T12:00:00')
        return f >= desde && f <= hasta
      })

      if (movsPeriodo.length === 0) {
        setResult(null)
        setLoading(false)
        return
      }

      const insights: InsightsResult = computeInsights(movimientos, desde, hasta)
      const contexto = buildContextoNarrativa(insights, movsPeriodo, desde, hasta)

      try {
        const res = await fetch('/api/analitica-insight', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            type:     'narrativa',
            periodo:  {
              desde: desde.toISOString().slice(0, 10),
              hasta: hasta.toISOString().slice(0, 10),
            },
            contexto,
          }),
        })

        if (cancelled) return

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          setError(errData.error ?? 'No pudimos generar el insight')
          setLoading(false)
          return
        }

        const data: InsightResponse = await res.json()
        setResult(data)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError('Error de red al pedir el insight')
          setLoading(false)
        }
      }
    }

    run()
    return () => { cancelled = true }
  }, [movimientos, desde, hasta, hasProAccess])

  // ─── PRO TEASER ─────────────────────────────────────────────────────────
  if (!hasProAccess) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">Insight inteligente del período</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-semibold uppercase tracking-wider">
                <Lock size={9} /> PRO
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Manguito analiza tu período y te cuenta en lenguaje natural qué pasó, qué cambió vs el período anterior, dónde están tus oportunidades y qué recomienda revisar. Acá un ejemplo:
            </p>
            <div className="bg-white/60 rounded-xl p-4 border border-slate-100 mb-3 italic text-sm text-slate-500 leading-relaxed">
              "En los últimos 6 meses tuviste tu mejor racha de ahorro: 32% vs 18% del semestre anterior, gracias a una caída de 47% en Suscripciones. La señal a mirar: Restaurants creció 28% y se acerca a tu promedio histórico. Si lo contenés ahora, podrías cerrar el año con ~$340k extra de ahorro."
            </div>
            <a
              href="/configuracion?tab=plan"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            >
              <Sparkles size={14} /> Activar Pro
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ─── LOADING ─────────────────────────────────────────────────────────────
  if (loading && !result) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/40 via-white to-violet-50/40 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shrink-0">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-bold text-slate-800">Manguito está analizando tu período...</p>
            <div className="h-3 bg-slate-100 rounded-full w-full animate-pulse" />
            <div className="h-3 bg-slate-100 rounded-full w-5/6 animate-pulse" />
            <div className="h-3 bg-slate-100 rounded-full w-3/4 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // ─── ERROR ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <AlertTriangle size={14} className="text-amber-500" />
          <span>No pudimos generar el insight ahora ({error})</span>
        </div>
      </div>
    )
  }

  // ─── NO DATA ─────────────────────────────────────────────────────────────
  if (!result) return null

  // ─── RESULT ──────────────────────────────────────────────────────────────
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/60 via-white to-violet-50/60 p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-bold text-slate-800">Insight del período</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-semibold uppercase tracking-wider">
              <Sparkles size={9} /> AI
            </span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{result.narrativa}</p>
        </div>
      </div>

      {result.highlights?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-15">
          {result.highlights.slice(0, 3).map((h, i) => {
            const Icon = ICON_MAP[h.icon] ?? AlertTriangle
            const styles = TONE_STYLES[h.tone] ?? TONE_STYLES.neutral
            return (
              <div key={i} className={`${styles.bg} rounded-xl p-3 flex items-start gap-2`}>
                <Icon size={14} className={`${styles.icon} mt-0.5 shrink-0`} />
                <p className={`text-xs font-medium leading-snug ${styles.text}`}>{h.text}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
