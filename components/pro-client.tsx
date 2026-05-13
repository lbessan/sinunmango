'use client'

// ─── Página /pro — showcase de features y CTA de compra ──────────────────────
//
// Server pasa: plan ('free'|'pro'|'grandfathered'), planExpiresAt, hasProAccess.
// Si hasProAccess=true → mostramos estado de la suscripción y gestión.
// Si no → showcase con pricing y CTA.
//
// La compra desde web va a estar disponible cuando termine Web Billing (RC).
// Por ahora el CTA abre un modal con instrucciones de descargar la app mobile.

import { useState } from 'react'
import {
  Sparkles, Bot, Camera, Mail, FileText, BarChart3, Palette,
  Check, X, Smartphone, ExternalLink, Crown,
} from 'lucide-react'
import type { Plan } from '@/lib/subscription'

type Props = {
  plan:          Plan
  planExpiresAt: string | null
  hasProAccess:  boolean
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

export function ProClient({ plan, planExpiresAt, hasProAccess }: Props) {
  const [openHowTo, setOpenHowTo] = useState<'monthly' | 'annual' | null>(null)

  return (
    <div className="max-w-5xl mx-auto space-y-8">

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
              <a
                href="https://play.google.com/store/account/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 mt-2"
              >
                Gestionar suscripción <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Trial / Pricing ───────────────────────────────────────────────────
          PRECIOS: hoy hardcoded como referencia AR. Cuando hagamos la
          integración mobile real con Purchases.getOfferings(), levantamos
          los precios desde RC (pkg.product.priceString) — ahí Google nos
          devuelve el precio en la moneda local del user automáticamente. */}
      {!hasProAccess && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PricingCard
            badge="Más popular"
            badgeColor="indigo"
            title="Mensual"
            price="$3.499"
            sub="por mes"
            cta="Probá 7 días gratis"
            highlight
            onClick={() => setOpenHowTo('monthly')}
          />
          <PricingCard
            badge="Ahorrás 36%"
            badgeColor="emerald"
            title="Anual"
            price="$26.999"
            sub="por año · equivale a $2.250/mes"
            cta="Probá 7 días gratis"
            onClick={() => setOpenHowTo('annual')}
          />
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
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
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
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Feature</p>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 text-center">Free</p>
            <p className="text-xs font-semibold uppercase tracking-wider px-4 text-center" style={{ color: '#6366f1' }}>Pro</p>
          </div>
          {COMPARADOR.map(row => (
            <div key={row.feature} className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-3 border-b border-slate-50 last:border-0">
              <p className="text-sm text-slate-700">{row.feature}</p>
              <ComparadorCell value={row.free} className="text-slate-400" />
              <ComparadorCell value={row.pro}  className="font-semibold" colorOverride="#6366f1" />
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
              Sí, sin penalización. La cancelación se hace desde la app de Google Play, en Suscripciones.
            </FAQ>
            <FAQ q="¿Qué pasa si bajo a Free?">
              Tus datos y configuración se mantienen intactos. Solo pasan a aplicar los límites mensuales en las features con IA y se desactiva la personalización (queda el tema actual pero no podés cambiarlo).
            </FAQ>
            <FAQ q="¿Por qué cobran por la IA?">
              Cada análisis con IA tiene un costo real para nosotros. El plan Pro nos permite mantener el servicio funcionando y mejorar las funcionalidades.
            </FAQ>
          </div>
        </section>
      )}

      {/* ── Modal cómo comprar (mientras no haya Web Billing) ─────────────── */}
      {openHowTo && (
        <HowToBuyModal plan={openHowTo} onClose={() => setOpenHowTo(null)} />
      )}
    </div>
  )
}

// ─── PricingCard ──────────────────────────────────────────────────────────────
function PricingCard({
  badge, badgeColor, title, price, sub, cta, highlight, onClick,
}: {
  badge?: string; badgeColor?: 'indigo' | 'emerald'
  title: string; price: string; sub: string; cta: string
  highlight?: boolean; onClick: () => void
}) {
  const badgeBg = badgeColor === 'emerald'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-indigo-100 text-indigo-700'

  return (
    <div className={`rounded-2xl p-6 border ${highlight ? 'bg-gradient-to-br from-indigo-50 via-white to-violet-50 border-indigo-100' : 'bg-white border-slate-100'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {badge && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${badgeBg}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-900">{price}</p>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      <button
        onClick={onClick}
        className="w-full mt-5 px-4 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 hover:shadow-md transition-shadow"
        style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
      >
        <Sparkles size={14} /> {cta}
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Cancelás cuando quieras
      </p>
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
      <div className="px-4 py-2 flex justify-center">
        <Check size={16} className={className} style={colorOverride ? { color: colorOverride } : undefined} />
      </div>
    )
  }
  if (value === false) {
    return (
      <div className="px-4 py-2 flex justify-center">
        <X size={16} className="text-slate-300" />
      </div>
    )
  }
  return (
    <div className="px-4 py-2 text-xs text-center min-w-[80px]">
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

// ─── HowToBuyModal — placeholder hasta tener Web Billing ─────────────────────
function HowToBuyModal({ plan, onClose }: { plan: 'monthly' | 'annual'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
            <Smartphone size={20} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>
        <p className="text-base font-bold text-slate-800 mb-1">
          Activá Pro {plan === 'monthly' ? 'mensual' : 'anual'}
        </p>
        <p className="text-sm text-slate-500 mb-5">
          Por ahora la compra se hace desde la app mobile. Estamos trabajando para habilitar la compra directa desde web.
        </p>
        <ol className="space-y-3 mb-5">
          {[
            'Descargá sinunmango desde Google Play',
            'Iniciá sesión con tu mismo email',
            'Andá a la página Pro y elegí tu plan',
            'Activá los 7 días de prueba gratis',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <a
          href="https://play.google.com/store/apps/details?id=com.sinunmango.mobile"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full block text-center px-4 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
        >
          Descargar la app
        </a>
      </div>
    </div>
  )
}
