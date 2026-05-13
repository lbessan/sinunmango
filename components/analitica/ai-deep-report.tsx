'use client'

// ─── AI Deep Report (Option C) ───────────────────────────────────────────────
//
// Botón "Pedir análisis profundo con AI". Cuando se clickea, llama al endpoint
// con type=profundo y muestra el reporte completo en Markdown.
// Gateado por plan Pro.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sparkles, Lock, Loader2, AlertTriangle, FileText } from 'lucide-react'
import { computeInsights } from './insights'
import { buildContextoProfundo } from './insight-context'
import { type MovAnalitica } from './utils'

type ReportResponse = { reporte: string }

export function AIDeepReport({
  movimientos,
  movsPeriodo,
  desde,
  hasta,
  hasProAccess,
}: {
  movimientos:  MovAnalitica[]
  movsPeriodo:  MovAnalitica[]
  desde:        Date
  hasta:        Date
  hasProAccess: boolean
}) {
  const [report, setReport]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const generate = async () => {
    if (!hasProAccess) return
    setLoading(true)
    setError(null)
    setReport(null)

    const insights = computeInsights(movimientos, desde, hasta)
    const contexto = buildContextoProfundo(insights, movsPeriodo, desde, hasta, movimientos)

    try {
      const res = await fetch('/api/analitica-insight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:    'profundo',
          periodo: {
            desde: desde.toISOString().slice(0, 10),
            hasta: hasta.toISOString().slice(0, 10),
          },
          contexto,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'No pudimos generar el análisis')
        setLoading(false)
        return
      }

      const data: ReportResponse = await res.json()
      setReport(data.reporte)
      setLoading(false)
    } catch {
      setError('Error de red al pedir el análisis')
      setLoading(false)
    }
  }

  // ─── PRO TEASER ─────────────────────────────────────────────────────────
  if (!hasProAccess) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <FileText size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">Análisis profundo con AI</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-semibold uppercase tracking-wider">
                <Lock size={9} /> PRO
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Generá un reporte personalizado del período: patrones que detectó la AI,
              áreas de oportunidad con ahorro estimado, outlook a 12 meses. Es como tener un asesor financiero leyendo tus datos.
            </p>
            <a
              href="/pro"
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

  // ─── BUTTON (idle) ──────────────────────────────────────────────────────
  if (!report && !loading && !error) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <FileText size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">Análisis profundo con AI</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-semibold uppercase tracking-wider">
                <Sparkles size={9} /> AI
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Manguito analiza el período actual con todos los datos disponibles: patrones temporales,
              comparativas, anomalías, oportunidades de ahorro y outlook. Lo genera en unos segundos.
            </p>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            >
              <Sparkles size={14} /> Generar análisis profundo
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── LOADING ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/40 via-white to-violet-50/40 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shrink-0">
            <Loader2 size={18} className="animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 mb-2">Generando análisis profundo...</p>
            <p className="text-xs text-slate-500 mb-3">Manguito está revisando tu período. Esto toma unos 10-15 segundos.</p>
            <div className="space-y-2">
              <div className="h-3 bg-slate-100 rounded-full w-full animate-pulse" />
              <div className="h-3 bg-slate-100 rounded-full w-5/6 animate-pulse" />
              <div className="h-3 bg-slate-100 rounded-full w-3/4 animate-pulse" />
              <div className="h-3 bg-slate-100 rounded-full w-4/5 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── ERROR ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-3 text-sm text-amber-700">
          <AlertTriangle size={16} />
          <span className="flex-1">{error}</span>
          <button
            onClick={generate}
            className="text-xs px-3 py-1 rounded-lg bg-white border border-amber-200 hover:bg-amber-50 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // ─── REPORT ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/30 via-white to-violet-50/30 p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-bold text-slate-800">Análisis profundo del período</p>
            <button
              onClick={generate}
              className="text-xs px-3 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
            >
              Regenerar
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Generado por Manguito AI · podría tener imprecisiones</p>
        </div>
      </div>

      {/* Markdown muy simple — renderizamos a mano para no agregar otra dep */}
      <article className="prose prose-sm max-w-none text-slate-700">
        {renderMarkdown(report!)}
      </article>
    </div>
  )
}

// ─── Mini renderer Markdown — sólo ## headers y párrafos ────────────────────
function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length === 0) return
    out.push(
      <p key={out.length} className="text-sm leading-relaxed mb-3 text-slate-700">
        {buffer.join(' ').trim()}
      </p>
    )
    buffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      flush()
      out.push(
        <h3 key={out.length} className="text-sm font-bold text-slate-800 uppercase tracking-wider mt-5 mb-2 first:mt-0">
          {trimmed.slice(3)}
        </h3>
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flush()
      out.push(
        <li key={out.length} className="text-sm leading-relaxed ml-5 text-slate-700 list-disc mb-1">
          {renderInline(trimmed.slice(2))}
        </li>
      )
    } else if (trimmed === '') {
      flush()
    } else {
      buffer.push(trimmed)
    }
  }
  flush()
  return out
}

function renderInline(s: string): ReactNode {
  // Convertir **bold** y *italic* básicos
  const parts: ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    if (m[1]) parts.push(<strong key={i++}>{m[1]}</strong>)
    else if (m[2]) parts.push(<em key={i++}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts
}
