import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { getPreapproval, MercadoPagoError } from '@/lib/mercadopago'
import { CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react'

// ─── /checkout/result ───────────────────────────────────────────────────────
//
// Página a la que MP redirige al user después de completar (o cancelar) el
// flow de autorización del preapproval. MP agrega query params al URL,
// pero los nombres / valores que pone varían (a veces `status`, a veces
// `collection_status`, a veces nada). NO confiamos en eso.
//
// En su lugar, leemos `preapproval_id` del URL y consultamos a MP el
// estado real del preapproval. Eso es la single source of truth.

type SearchParams = Promise<{
  preapproval_id?:    string
  collection_status?: string
  status?:            string
}>

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { user } = await getAuthedClient()
  if (!user) redirect('/login')

  const params         = await searchParams
  const preapprovalId  = params.preapproval_id
  const queryStatus    = params.status ?? params.collection_status ?? null

  console.log(`[checkout/result] params: preapproval_id=${preapprovalId} status=${queryStatus}`)

  // Consultamos a MP el estado real del preapproval. Single source of
  // truth — no confiamos en query params.
  let realStatus: string | null = null
  let fetchError: string | null = null
  if (preapprovalId) {
    try {
      const pre = await getPreapproval(preapprovalId)
      realStatus = pre.status
      console.log(`[checkout/result] preapproval ${preapprovalId} → status=${pre.status} next_payment=${pre.next_payment_date}`)
    } catch (err) {
      if (err instanceof MercadoPagoError) {
        console.error(`[checkout/result] MP fetch error ${err.status}:`, err.rawBody.slice(0, 300))
        fetchError = `MP ${err.status}`
      } else {
        console.error('[checkout/result] unexpected:', err)
        fetchError = 'unknown'
      }
    }
  }

  // Decidir variant: el status REAL del preapproval manda. Si no lo
  // pudimos consultar (fetchError), caemos al query param como fallback.
  const effectiveStatus = realStatus ?? queryStatus ?? 'unknown'
  const variant = (() => {
    if (effectiveStatus === 'authorized') return 'success'
    if (effectiveStatus === 'approved')   return 'success'
    if (effectiveStatus === 'pending')    return 'pending'
    if (effectiveStatus === 'paused')     return 'pending'  // MP a veces deja "paused" temporal antes de "authorized"
    return 'error'
  })()

  return (
    <Suspense fallback={null}>
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 p-8 sm:p-10 text-center shadow-sm">
          {variant === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">¡Listo!</h1>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                Autorizaste el cobro recurrente. Tu trial de 7 días arrancó.
                Al octavo día, Mercado Pago te va a cobrar la primera cuota.
                Si cancelás antes, no se te cobra nada.
              </p>
            </>
          )}

          {variant === 'pending' && (
            <>
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center">
                <Clock size={32} className="text-amber-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Pago pendiente</h1>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                Mercado Pago todavía está confirmando la operación. Esto puede
                tardar unos minutos. Cuando se confirme, tu plan Pro se activa
                automáticamente.
              </p>
            </>
          )}

          {variant === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">No se completó</h1>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                La autorización en Mercado Pago no se completó. Si fue sin
                querer, podés volver a intentarlo. Si tuviste un problema con
                la tarjeta, probá con otra.
              </p>
            </>
          )}

          <div className="mt-8 space-y-2">
            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(90deg, #1B3A6B, #1a6b5a)' }}
            >
              Ir al dashboard
              <ArrowRight size={15} />
            </Link>

            {variant === 'error' && (
              <Link
                href="/pro"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Volver a intentar
              </Link>
            )}

            {variant === 'success' && (
              <Link
                href="/configuracion/suscripcion"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Ver mi suscripción
              </Link>
            )}
          </div>

          {/* Footer — info técnica para soporte si hay problemas */}
          {preapprovalId && (
            <p className="mt-6 text-[10px] uppercase tracking-wider text-slate-300 font-mono">
              ID: {preapprovalId.slice(0, 16)}…
              {realStatus && ` · ${realStatus}`}
              {fetchError && ` · fetch:${fetchError}`}
            </p>
          )}
        </div>
      </div>
    </Suspense>
  )
}
