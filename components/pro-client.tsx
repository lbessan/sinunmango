'use client'

// ─── Página /pro — showcase de features y CTA de compra vía Mercado Pago ────
//
// Server pasa: plan, planExpiresAt, hasProAccess + pricing (priceArs,
// earlyAccess, earlySlotsRemaining).
//
// Flujo de suscripción:
//   1. User toca "Suscribirme ahora" → POST /api/billing/mp/subscribe
//   2. Endpoint crea un preapproval en MP y devuelve { init_point }
//   3. window.location = init_point → MP checkout
//   4. MP redirige a /checkout/result con query params del status
//   5. Webhook MP confirma autorización → activa Pro en backend

import { useState } from 'react'
import {
  Sparkles, Bot, Camera, Mail, FileText, BarChart3, Palette,
  Check, X, ExternalLink, Crown, Loader2, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { Plan } from '@/lib/subscription'

type Props = {
  plan:                  Plan
  planExpiresAt:         string | null
  hasProAccess:          boolean
  // Plan EFECTIVO del workspace activo. Cuando el user es invitee Pro-vía-share,
  // hasProAccess (su plan propio) puede ser false PERO effectiveHasProAccess es
  // true. En ese caso le mostramos un banner explicando que pagar Pro acá
  // aplicaría a SU propio workspace, no al del owner.
  effectiveHasProAccess: boolean
  effectiveSource:       'own' | 'workspace_share'
  effectiveOwnerEmail:   string | null
  priceArs:              number
  earlyAccess:           boolean
  earlySlotsRemaining:   number
}

const FEATURES = [
  {
    icon:  Bot,
    title: 'Asistente conversacional ilimitado',
    desc:  'Charlá con Manguito sin restricciones. Te ayuda a cargar movimientos, responder dudas de tus finanzas y armar reportes a pedido.',
  },
  {
    icon:  Camera,
    title: 'Cargar gastos por foto de ticket',
    desc:  'Sacale una foto al ticket del super, restaurante, lo que sea — la IA detecta el comercio, el monto, la fecha y lo categoriza solo.',
  },
  {
    icon:  Mail,
    title: 'Movimientos automáticos por mail',
    desc:  'Reenviás el mail de la tarjeta a tu dirección de Manguito y los consumos se cargan automáticamente — categorizados y listos para conciliar.',
  },
  {
    icon:  FileText,
    title: 'Importar resumen PDF de tarjeta',
    desc:  'Subís el PDF del resumen del banco y se cargan todos los consumos del período de una. Ideal para arrancar con tu histórico.',
  },
  {
    icon:  Sparkles,
    title: 'Insights con IA en Analítica',
    desc:  'La IA analiza tu período y te explica en lenguaje natural qué cambió, dónde están tus oportunidades y qué te conviene revisar.',
  },
  {
    icon:  BarChart3,
    title: 'Informe completo con IA',
    desc:  'Un reporte largo, escrito, que cruza ingresos, gastos, suscripciones y patrones de los últimos meses. Como tener un analista financiero personal.',
  },
  {
    icon:  Palette,
    title: 'Personalización completa',
    desc:  'Cambiá el color de acento de la app y elegí entre modo claro y oscuro. Hacé que sinunmango se vea como te gusta.',
  },
] as const

const COMPARADOR = [
  { feature: 'Dashboard, proyecciones y analítica',         free: true,  pro: true  },
  { feature: 'Cargar movimientos manualmente',              free: true,  pro: true  },
  { feature: 'Gastos fijos, parámetros y conciliaciones',   free: true,  pro: true  },
  { feature: 'Asistente conversacional',                    free: '5/mes',  pro: 'ilimitado' },
  { feature: 'Cargar por foto de ticket',                   free: '3/mes',  pro: 'ilimitado' },
  { feature: 'Movimientos automáticos por mail',            free: '1/mes',  pro: 'ilimitado' },
  { feature: 'Importar resumen PDF de tarjeta',             free: '1/mes',  pro: 'ilimitado' },
  { feature: 'Insights con IA en Analítica',                free: false, pro: true  },
  { feature: 'Informe completo con IA',                     free: false, pro: true  },
  { feature: 'Personalización (tema claro/oscuro, colores)',free: false, pro: true  },
] as const

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export function ProClient({
  plan,
  planExpiresAt,
  hasProAccess,
  effectiveHasProAccess,
  effectiveSource,
  effectiveOwnerEmail,
  priceArs,
  earlyAccess,
  earlySlotsRemaining,
}: Props) {
  // Banner para invitee en workspace ajeno: el user accede a Pro vía el
  // owner, pero ESTA página le ofrece pagar Pro para SU propia cuenta.
  // Le aclaramos la distinción para que no piense que ya está pagando.
  const showShareBanner = effectiveSource === 'workspace_share' && effectiveHasProAccess && !hasProAccess
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/mp/subscribe', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // En sandbox, mostramos también el detalle de MP para diagnosticar
        // rápido. mp_status + mp_body solo se mandan cuando el server detecta
        // que está corriendo con TEST- token.
        const baseMsg = data.error ?? `Error ${res.status}`
        const detail = data.mp_body
          ? `\n\n[MP ${data.mp_status}] ${data.mp_body.slice(0, 300)}`
          : ''
        throw new Error(baseMsg + detail)
      }
      const data = await res.json() as { init_point?: string }
      if (!data.init_point) {
        throw new Error('Respuesta inválida del servidor.')
      }
      // Redirect al checkout de MP. window.location preserva el flow estándar
      // (back button del navegador funciona, MP recibe el referrer correcto).
      window.location.href = data.init_point
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos iniciar el cobro.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── Banner workspace_share: estás usando Pro del owner ────────────── */}
      {showShareBanner && (
        <div className="rounded-2xl p-5 bg-gradient-to-br from-indigo-50 via-white to-violet-50 border border-indigo-100 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">
              Ya tenés Pro en este workspace{effectiveOwnerEmail ? ` (vía ${effectiveOwnerEmail})` : ''}
            </p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Estás accediendo a las features Pro porque el owner del workspace activo paga Pro.
              Si suscribís tu cuenta acá, Pro aplicará a TU workspace personal — no afecta el del owner.
            </p>
          </div>
        </div>
      )}

      {/* ── Estado: usuario YA es Pro ─────────────────────────────────────── */}
      {hasProAccess && (
        <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border border-emerald-100 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0">
            <Crown size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">
              {plan === 'grandfathered'
                ? 'Tenés acceso Pro de por vida — gracias por ser early adopter'
                : 'Estás disfrutando de sinunmango Pro'}
            </p>
            {plan === 'pro' && planExpiresAt && (
              <p className="text-xs text-slate-500 mt-0.5">
                Próxima renovación: {new Date(planExpiresAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            {plan === 'pro' && (
              <Link
                href="/configuracion/suscripcion"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 mt-2"
              >
                Gestionar suscripción <ExternalLink size={11} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Pricing card ──────────────────────────────────────────────────── */}
      {!hasProAccess && (
        <div className="max-w-md mx-auto">
          <div className={`rounded-2xl p-7 border ${earlyAccess ? 'bg-gradient-to-br from-amber-50 via-white to-emerald-50/40 border-amber-200' : 'bg-gradient-to-br from-indigo-50 via-white to-violet-50 border-indigo-100'}`}>
            {/* Badge superior */}
            {earlyAccess ? (
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
                  ✦ Early access
                </span>
                <span className="text-xs text-amber-700 font-medium">
                  Quedan {earlySlotsRemaining} {earlySlotsRemaining === 1 ? 'lugar' : 'lugares'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
                  ✦ Plan Pro
                </span>
              </div>
            )}

            <p className="text-sm font-bold text-slate-800 mb-1">Mensual</p>

            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-4xl font-bold text-slate-900 tabular-nums">
                ${fmt(priceArs)}
              </p>
              <p className="text-sm text-slate-500">/ mes</p>
            </div>

            {earlyAccess ? (
              <p className="text-xs text-amber-700 font-medium">
                50% off durante los primeros 12 meses como early adopter
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Sin permanencia · Cancelás cuando quieras
              </p>
            )}

            {/* Lista de beneficios cortita */}
            <ul className="mt-5 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                <span>Manguito + tickets + PDFs + emails — todo ilimitado</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                <span>Insights con IA en Analítica y reportes mensuales</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                <span>Temas de color, modo claro y oscuro</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                <span><strong>7 días gratis</strong> — sin cargo si cancelás antes</span>
              </li>
            </ul>

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap break-words font-mono leading-relaxed">{error}</span>
              </div>
            )}

            {/* CTA principal */}
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full mt-6 px-4 py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 hover:shadow-md transition-all disabled:opacity-70"
              style={{ background: 'linear-gradient(90deg, #1B3A6B, #1a6b5a)' }}
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Redirigiendo…</>
                : <><Sparkles size={15} /> Suscribirme con Mercado Pago</>
              }
            </button>

            <p className="text-[11px] text-slate-400 text-center mt-3">
              Pagás con tarjeta, débito, CBU o efectivo via MP
            </p>
          </div>
        </div>
      )}

      {/* ── Features grid ──────────────────────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
          Qué incluye Pro
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white rounded-2xl border border-slate-100 p-5 flex items-start gap-4 hover:shadow-sm transition-shadow">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #1B3A6B, #1a6b5a)' }}
              >
                <f.icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 mb-1">{f.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comparador free vs pro ─────────────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
          Free vs Pro
        </p>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-3 sm:px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Feature</p>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 sm:px-4 text-center">Free</p>
            <p className="text-xs font-semibold uppercase tracking-wider px-2 sm:px-4 text-center" style={{ color: '#1a6b5a' }}>Pro</p>
          </div>
          {COMPARADOR.map(row => (
            <div key={row.feature} className="grid grid-cols-[1fr_auto_auto] items-center px-3 sm:px-5 py-3 border-b border-slate-50 last:border-0">
              <p className="text-xs sm:text-sm text-slate-700">{row.feature}</p>
              <ComparadorCell value={row.free} className="text-slate-400" />
              <ComparadorCell value={row.pro}  className="font-semibold" colorOverride="#1a6b5a" />
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ corta ──────────────────────────────────────────────────────── */}
      {!hasProAccess && (
        <section className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Preguntas frecuentes
          </p>
          <div className="space-y-3">
            <FAQ q="¿El trial me cobra?">
              No. Durante los 7 días no se te hace ningún cargo. Si cancelás antes del día 7, no pagás nada y volvés a Free.
            </FAQ>
            <FAQ q="¿Puedo cancelar cuando quiera?">
              Sí, sin penalización. La cancelación se hace desde la app, en Configuración → Suscripción.
              Tu plan Pro sigue activo hasta el fin del período pago, después degrada a Free.
            </FAQ>
            <FAQ q="¿Qué pasa si bajo a Free?">
              Tus datos y configuración se mantienen intactos. Solo pasan a aplicar los límites mensuales en las features con IA y se desactiva la personalización (queda el tema actual pero no podés cambiarlo).
            </FAQ>
            <FAQ q="¿Cómo paga MP?">
              Tarjeta de crédito, débito, CBU/CVU, dinero en cuenta MP, o efectivo en Rapipago/PagoFácil. Eligís al momento de suscribirte.
            </FAQ>
            {earlyAccess && (
              <FAQ q="¿Qué es Early Access?">
                Los primeros 100 suscriptores pagan ${fmt(priceArs)}/mes durante 12 meses (50% off). Después de los 12 meses, te pedimos renovar al precio normal de $6.999/mes. Es nuestra forma de agradecerle a los que apuestan al producto temprano.
              </FAQ>
            )}
            <FAQ q="¿Por qué cobran por la IA?">
              Cada análisis con IA tiene un costo real para nosotros. El plan Pro nos permite mantener el servicio funcionando y mejorar las funcionalidades.
            </FAQ>
          </div>
        </section>
      )}
    </div>
  )
}

// ─── ComparadorCell ───────────────────────────────────────────────────────────
function ComparadorCell({
  value, className, colorOverride,
}: {
  value: string | boolean; className?: string; colorOverride?: string
}) {
  if (value === true) {
    return (
      <div className="px-2 sm:px-4 py-2 flex justify-center">
        <Check size={16} className={className} style={colorOverride ? { color: colorOverride } : undefined} />
      </div>
    )
  }
  if (value === false) {
    return (
      <div className="px-2 sm:px-4 py-2 flex justify-center">
        <X size={16} className="text-slate-300" />
      </div>
    )
  }
  return (
    <div className="px-2 sm:px-4 py-2 text-[11px] sm:text-xs text-center min-w-[56px] sm:min-w-[80px]">
      <span className={className} style={colorOverride ? { color: colorOverride } : undefined}>
        {value}
      </span>
    </div>
  )
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────
function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900 transition-colors list-none flex items-center justify-between">
        <span>{q}</span>
        <span className="text-slate-300 group-open:rotate-90 transition-transform">›</span>
      </summary>
      <p className="text-xs text-slate-500 leading-relaxed mt-2 pl-0.5">{children}</p>
    </details>
  )
}
