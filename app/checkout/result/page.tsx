import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react'

// ─── /checkout/result ───────────────────────────────────────────────────────
//
// Página a la que MP redirige al user después de completar (o cancelar) el
// flow de autorización del preapproval. MP agrega query params al URL:
//   - collection_status: approved | pending | rejected | null
//   - preapproval_id:    el ID del preapproval
//   - status:            authorized | pending | cancelled
//
// Mostramos feedback acorde + CTA para volver a la app. NO confiamos en los
// query params para activar Pro — eso lo hace el webhook (más seguro, MP
// firma los webhooks pero no los query params).

type SearchParams = Promise<{
  collection_status?: string
  preapproval_id?:    string
  status?:            string
}>

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { user } = await getAuthedClient()
  if (!user) redirect('/login')

  const params = await searchParams
  const status = params.status ?? params.collection_status ?? 'unknown'

  // 3 estados visuales según lo que devolvió MP
  const variant = (() => {
    if (status === 'authorized' || status === 'approved') return 'success'
    if (status === 'pending')                              return 'pending'
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

          {/* Footer chico — info técnica para soporte si hay problemas */}
          {params.preapproval_id && (
            <p className="mt-6 text-[10px] uppercase tracking-wider text-slate-300 font-mono">
              ID: {params.preapproval_id.slice(0, 16)}…
            </p>
          )}
        </div>
      </div>
    </Suspense>
  )
}
