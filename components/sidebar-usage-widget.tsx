'use client'

// ─── Sidebar Usage Widget ─────────────────────────────────────────────────────
//
// Muestra al user Free cuántos consumos Pro le quedan del mes:
//   - Asistente: N/5
//   - Tickets:   N/3
//   - Resumen:   N/1
//   - Mail:      N/1
// Y un CTA grande "Probá Pro" abajo.
//
// Si el user es Pro: muestra un badge sutil "✓ Plan Pro" sin counters.
//
// Lo monta el sidebar en el footer. Hace fetch a /api/me al montar y revalida
// cada vez que la pestaña gana focus (para reflejar consumos hechos en la sesión).

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sparkles, Crown } from 'lucide-react'

type UsageFeature = { used: number; limit: number; remaining: number }
type Me = {
  has_pro_access:   boolean
  plan:             'free' | 'pro' | 'grandfathered'
  // Origen del plan efectivo: 'own' = mi propio plan; 'workspace_share' =
  // estoy en workspace ajeno y heredo el plan del owner.
  plan_source?:     'own' | 'workspace_share'
  plan_owner_email?: string | null
  usage:            {
    asistente:    UsageFeature
    ticket:       UsageFeature
    resumen:      UsageFeature
    mail_tarjeta: UsageFeature
  } | null
}

const FEATURE_LABELS: Record<keyof NonNullable<Me['usage']>, string> = {
  asistente:    'Asistente',
  ticket:       'Tickets',
  resumen:      'Resúmenes',
  mail_tarjeta: 'Mails',
}

export function SidebarUsageWidget() {
  const [data, setData] = useState<Me | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    load()
    const onFocus  = () => load()
    const onChange = () => load()
    window.addEventListener('focus', onFocus)
    window.addEventListener('usage:changed', onChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('usage:changed', onChange)
    }
  }, [load])

  if (!data) return null

  // Pro: badge discreto. Cuando el Pro viene de un workspace ajeno (invitee
  // accediendo a un workspace cuyo owner pagó Pro), lo decimos explícito
  // para que el user entienda de dónde le viene el acceso.
  if (data.has_pro_access) {
    const viaShare = data.plan_source === 'workspace_share'
    // Cortamos el local-part del email del owner para que entre en el badge.
    const ownerLabel = viaShare && data.plan_owner_email
      ? data.plan_owner_email.split('@')[0]
      : null

    return (
      <div className="px-4 py-2.5 mx-2 mb-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-700/10 border border-emerald-500/20 flex items-center gap-2.5">
        <Crown size={14} className="text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-emerald-300 leading-tight truncate">
            {viaShare ? `Pro vía ${ownerLabel ?? 'workspace compartido'}` : 'Plan Pro activo'}
          </p>
          <p className="text-[10px] text-emerald-200/60 leading-tight">
            {viaShare ? 'En este workspace' : 'Sin límites'}
          </p>
        </div>
      </div>
    )
  }

  // Free: counters + CTA
  const features = Object.entries(data.usage ?? {}) as Array<[keyof NonNullable<Me['usage']>, UsageFeature]>

  return (
    <div className="mx-2 mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-3.5 pt-3 pb-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55 mb-2.5">
          Tus cupos del mes
        </p>
        <div className="space-y-1.5">
          {features.map(([key, f]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[11px] text-white/75">{FEATURE_LABELS[key]}</span>
              <span className={`text-[11px] font-semibold tabular-nums ${f.remaining === 0 ? 'text-amber-400' : 'text-white/85'}`}>
                {f.used} / {f.limit}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Link
        href="/pro"
        className="block px-3.5 py-2.5 text-center text-[11px] font-semibold text-white border-t border-white/10 hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
      >
        <Sparkles size={11} /> Probá Pro 7 días gratis
      </Link>
    </div>
  )
}
