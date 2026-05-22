import { getAuthedClient } from '@/lib/supabase/server'
import { adminClient }    from '@/lib/supabase/admin'
import { getUserPlan }    from '@/lib/subscription'
import { redirect }       from 'next/navigation'
import { Sparkles }       from 'lucide-react'
import { ProClient }      from '@/components/pro-client'
import {
  PRO_PRICE_ARS,
  EARLY_ACCESS_PRICE_ARS,
  EARLY_ACCESS_LIMIT,
} from '@/lib/mercadopago'

export default async function ProPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const plan = await getUserPlan(supabase)

  // ── Pricing dinámico — early access vs standard ──────────────────────────
  // Si quedan slots en el early access (primeros 100 suscriptores), el user
  // ve $3.499/mes. Si ya se cumplieron, $6.999/mes. Calculamos server-side
  // para evitar discrepancia entre lo que se muestra y lo que MP cobra.
  const { count: earlyAccessUsed } = await adminClient
    .from('user_profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('early_access', true)

  const earlyAccessAvailable = (earlyAccessUsed ?? 0) < EARLY_ACCESS_LIMIT
  const priceArs             = earlyAccessAvailable ? EARLY_ACCESS_PRICE_ARS : PRO_PRICE_ARS
  const earlySlotsRemaining  = Math.max(0, EARLY_ACCESS_LIMIT - (earlyAccessUsed ?? 0))

  return (
    <div>
      {/* ── Banner full-bleed ─────────────────────────────────────────────── */}
      <div
        className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6 lg:mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 50%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-5 pt-6 pb-6 lg:px-10 lg:pt-9 lg:pb-8 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
              sinunmango Pro
            </p>
            <p className="text-2xl lg:text-3xl font-bold text-white leading-tight mb-1">
              Tu app, potenciada
            </p>
            <p className="text-sm text-white/55 max-w-lg">
              Automatizá la carga, dejá que la IA te explique tus números y personalizá la app.
            </p>
          </div>
          <Sparkles size={52} strokeWidth={1.2} className="text-white/15 mt-1 hidden sm:block" />
        </div>
      </div>

      <ProClient
        plan={plan.plan}
        planExpiresAt={plan.plan_expires_at}
        hasProAccess={plan.has_pro_access}
        priceArs={priceArs}
        earlyAccess={earlyAccessAvailable}
        earlySlotsRemaining={earlySlotsRemaining}
      />
    </div>
  )
}
