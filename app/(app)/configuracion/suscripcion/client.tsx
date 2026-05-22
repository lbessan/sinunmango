'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Crown, AlertCircle, Loader2, ArrowLeft, X, CheckCircle2,
  Calendar, CreditCard, Sparkles,
} from 'lucide-react'

// ─── SuscripcionClient ──────────────────────────────────────────────────────
//
// Vista de gestión de la suscripción Pro del user. Fetcha el estado desde
// /api/billing/mp/status y permite cancelar vía /api/billing/mp/cancel.
//
// Estados a renderear:
//   - Loading inicial
//   - Sin suscripción / Free: CTA para suscribirse (link a /pro)
//   - Pending: autorización en MP en proceso (recién creado el preapproval)
//   - Authorized + plan='pro': suscripción activa con cobro recurrente.
//     Mostrar próxima fecha de cobro + monto + early access badge + cancel
//   - Paused + plan='pro': cancelada pero sigue Pro hasta plan_expires_at
//   - Cancelled: ya no es Pro

type Status = {
  ok:                      true
  plan:                    'free' | 'pro' | 'grandfathered'
  plan_period:             string | null
  plan_amount:             number | null
  plan_renews_at:          string | null
  plan_expires_at:         string | null
  mp_status:               'pending' | 'authorized' | 'paused' | 'cancelled' | null
  has_preapproval:         boolean
  early_access:            boolean
  early_access_expires_at: string | null
  subscribed_at:           string | null
  last_payments: Array<{
    mp_payment_id: string
    amount:        number
    currency:      string
    status:        string
    status_detail: string | null
    created_at:    string
  }>
}

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export function SuscripcionClient() {
  const router = useRouter()
  const [status,    setStatus]    = useState<Status | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [toast,     setToast]     = useState<string | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/mp/status')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json() as Status
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos leer tu suscripción.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleCancel = async () => {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/mp/cancel', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      const data = await res.json()
      setConfirmOpen(false)
      setToast(data.message ?? 'Suscripción cancelada.')
      await fetchStatus()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cancelar.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading && !status) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm">
          <Loader2 size={20} className="animate-spin mx-auto mb-2" />
          Cargando tu suscripción…
        </div>
      </div>
    )
  }

  const isPro       = status?.plan === 'pro' || status?.plan === 'grandfathered'
  const isPending   = status?.mp_status === 'pending'
  const isCancelled = status?.mp_status === 'paused' || status?.mp_status === 'cancelled'
  const stillActive = isCancelled && status?.plan_expires_at && new Date(status.plan_expires_at) > new Date()

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/configuracion" className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Suscripción</h1>
          <p className="text-xs text-slate-500 mt-0.5">Tu plan, próximo cobro y método de pago.</p>
        </div>
      </div>

      {/* Toast de cancelación exitosa */}
      {toast && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Estado del plan */}
      {!isPro && !isPending && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8">
          <p className="text-sm font-bold text-slate-800">Estás en Free</p>
          <p className="mt-1 text-sm text-slate-500">
            Aprovechá la app sin límites con el plan Pro. 7 días de prueba sin cargo.
          </p>
          <Link
            href="/pro"
            className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(90deg, #1B3A6B, #1a6b5a)' }}
          >
            <Sparkles size={15} /> Ver planes
          </Link>
        </div>
      )}

      {isPending && (
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <Loader2 size={20} className="text-amber-500 animate-spin mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Autorización en curso</p>
              <p className="mt-1 text-sm text-amber-700">
                Mercado Pago está procesando tu autorización. Esto puede tardar
                algunos minutos. Refrescá esta página en un rato.
              </p>
            </div>
          </div>
        </div>
      )}

      {isPro && status && (
        <>
          <div className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border border-emerald-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0">
                <Crown size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold text-slate-800">sinunmango Pro</p>
                  {status.early_access && (
                    <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      ✦ Early access
                    </span>
                  )}
                  {stillActive && (
                    <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      Cancelada
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {status.plan === 'grandfathered'
                    ? 'Acceso de por vida como early adopter.'
                    : isCancelled
                      ? `Cancelaste tu suscripción. Seguís Pro hasta el ${fmtDate(status.plan_expires_at)}.`
                      : 'Tu plan está activo y se renueva automáticamente.'}
                </p>
              </div>
            </div>
          </div>

          {/* Detalles */}
          {status.plan !== 'grandfathered' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <Row icon={<CreditCard size={16} />} label="Plan">
                Mensual
                {status.plan_amount && (
                  <span className="text-slate-500 ml-1.5">
                    · ${fmt(status.plan_amount)} ARS / mes
                  </span>
                )}
              </Row>
              <Row icon={<Calendar size={16} />} label={isCancelled ? 'Vence' : 'Próximo cobro'}>
                {fmtDate(isCancelled ? status.plan_expires_at : status.plan_renews_at)}
              </Row>
              {status.early_access && status.early_access_expires_at && (
                <Row icon={<Sparkles size={16} />} label="Early access hasta">
                  {fmtDate(status.early_access_expires_at)}
                  <p className="text-xs text-slate-500 mt-0.5">
                    Después renovás al precio normal ($6.999/mes).
                  </p>
                </Row>
              )}
              <Row icon={<Calendar size={16} />} label="Suscripto desde">
                {fmtDate(status.subscribed_at)}
              </Row>
            </div>
          )}

          {/* Historial de cobros */}
          {status.last_payments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <p className="px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50">
                Últimos cobros
              </p>
              {status.last_payments.map(p => (
                <div key={p.mp_payment_id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700 tabular-nums">
                      ${fmt(p.amount)} {p.currency}
                    </p>
                    <p className="text-xs text-slate-400">{fmtDate(p.created_at)}</p>
                  </div>
                  <PaymentBadge status={p.status} />
                </div>
              ))}
            </div>
          )}

          {/* Acciones */}
          {!isCancelled && status.plan !== 'grandfathered' && (
            <div className="pt-2">
              <button
                onClick={() => setConfirmOpen(true)}
                className="text-sm text-red-500 hover:text-red-600 font-medium"
              >
                Cancelar suscripción
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal de confirmación */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <AlertCircle size={22} />
              </div>
              <button
                onClick={() => setConfirmOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-base font-bold text-slate-800 mb-1">
              ¿Cancelar la suscripción?
            </p>
            <p className="text-sm text-slate-500 mb-5">
              Tu plan Pro sigue activo hasta el{' '}
              <strong className="text-slate-700">{fmtDate(status?.plan_renews_at ?? null)}</strong>{' '}
              y no te vamos a cobrar de nuevo. Después del vencimiento, volvés a Free.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Mejor no
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                {cancelling
                  ? <><Loader2 size={14} className="animate-spin" /> Cancelando…</>
                  : 'Sí, cancelar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-slate-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
        <div className="text-sm text-slate-700 mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function PaymentBadge({ status }: { status: string }) {
  const cfg = {
    approved:    { bg: 'bg-emerald-50', color: 'text-emerald-700', label: 'Pagado' },
    rejected:    { bg: 'bg-red-50',     color: 'text-red-700',     label: 'Rechazado' },
    in_process:  { bg: 'bg-amber-50',   color: 'text-amber-700',   label: 'En proceso' },
    refunded:    { bg: 'bg-slate-50',   color: 'text-slate-600',   label: 'Devuelto' },
    cancelled:   { bg: 'bg-slate-50',   color: 'text-slate-600',   label: 'Cancelado' },
    pending:     { bg: 'bg-amber-50',   color: 'text-amber-700',   label: 'Pendiente' },
    authorized:  { bg: 'bg-emerald-50', color: 'text-emerald-700', label: 'Autorizado' },
  }[status] ?? { bg: 'bg-slate-50', color: 'text-slate-600', label: status }
  return (
    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}
