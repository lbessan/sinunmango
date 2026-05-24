'use client'

// ─── Modal "Pasate a Pro" — se muestra cuando se llega al límite mensual ────
//
// Se monta en cada página/componente que llama a un endpoint Pro. Cuando la
// respuesta es 429 con error='limit_reached', se setea el state y se abre.
//
// Copy y CTA varían según el feature (asistente, ticket, resumen, mail).
//
// IMPORTANTE: el render va vía createPortal a document.body para escapar
// stacking contexts de ancestros. Sin esto, cuando el modal se montaba
// adentro del sidebar (position: sticky crea stacking context aunque no
// haya z-index), el <main> hermano pintaba encima y tapaba parte del modal.
// Bug observado: la sección de proyecciones del dashboard renderaba ENCIMA
// del título/body/botones de este modal. Portal evita stacking contexts
// porque el modal pasa a ser hijo directo de <body>.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'

export type LimitReachedInfo = {
  // 'personalizacion' no es un rate-limit sino un feature 100% Pro — usamos
  // este mismo modal porque visualmente queremos la misma CTA "Pasate a Pro".
  feature: 'asistente' | 'ticket' | 'resumen' | 'mail_tarjeta' | 'personalizacion'
  limit:   number  // -1 si no aplica
  used:    number  // 0 si no aplica
}

const COPY: Record<LimitReachedInfo['feature'], { title: string; body: string }> = {
  asistente: {
    title: 'Llegaste al límite del asistente',
    body:  'Pasate a Pro y charlá con Manguito sin límites — además te incluye parseo de tickets, mails de tarjeta e insights con IA.',
  },
  ticket: {
    title: 'Llegaste al límite de tickets del mes',
    body:  'Pasate a Pro y cargá fotos de tickets sin límite — la IA detecta comercio, monto y fecha por vos.',
  },
  resumen: {
    title: 'Llegaste al límite de resúmenes del mes',
    body:  'Pasate a Pro y subí tantos resúmenes de tarjeta como necesites — todos los consumos se cargan automáticamente.',
  },
  mail_tarjeta: {
    title: 'Llegaste al límite de mails parseados',
    body:  'Pasate a Pro y procesá todos los mails de tus tarjetas sin restricciones.',
  },
  personalizacion: {
    title: 'La personalización es Pro',
    body:  'Pasate a Pro para elegir el color de acento de la app y alternar entre modo claro y oscuro.',
  },
}

export function LimitReachedModal({
  info, onClose,
}: {
  info:    LimitReachedInfo | null
  onClose: () => void
}) {
  // SSR guard: createPortal necesita document, que no existe en server.
  // En el primer render del cliente mounted=false → no rendereamos nada;
  // tras el primer paint useEffect marca mounted=true y ya podemos
  // usar document.body como target del portal.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!info || !mounted) return null
  const { title, body } = COPY[info.feature]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-2xl shadow-xl max-w-md w-full p-6"
        style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 60%, #eef2ff 100%)', border: '1px solid #e0e7ff' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <Sparkles size={20} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>
        <p className="text-base font-bold text-slate-800 mb-1.5">{title}</p>
        {info.feature !== 'personalizacion' && info.limit > 0 && (
          <p className="text-xs text-slate-500 mb-3">Usaste {info.used} de {info.limit} este mes</p>
        )}
        <p className="text-sm text-slate-600 leading-relaxed mb-5">{body}</p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-white/60 transition-colors"
          >
            Más tarde
          </button>
          <Link
            href="/pro"
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
          >
            <Sparkles size={14} /> Ver Plan Pro
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Helper: parsea una Response 429 y devuelve LimitReachedInfo o null ─────
// Uso típico en el fetch handler:
//   const info = await tryParseLimitReached(res)
//   if (info) { setLimit(info); return }
export async function tryParseLimitReached(res: Response): Promise<LimitReachedInfo | null> {
  if (res.status !== 429) return null
  try {
    const data = await res.clone().json()
    if (data.error === 'limit_reached' && data.feature) {
      return {
        feature: data.feature as LimitReachedInfo['feature'],
        limit:   data.limit ?? 0,
        used:    data.used  ?? 0,
      }
    }
  } catch { /* fallthrough */ }
  return null
}
