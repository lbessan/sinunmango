import { getAuthedClient } from '@/lib/supabase/server'
import { getUserPlan } from '@/lib/subscription'
import { redirect } from 'next/navigation'
import { ConfiguracionClient } from '@/components/configuracion-client'
import { Settings } from 'lucide-react'

export default async function ConfiguracionPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const plan = await getUserPlan(supabase)

  return (
    <div>
      {/* ── Banner full-bleed ──────────────────────────────────────────────
          Los margins negativos compensan el padding del <main> en app-shell
          (p-4 lg:p-8). Antes era -mx-8 fijo → en mobile (p-4) sobraban
          16px → overflow lateral. */}
      <div
        className="-mx-4 -mt-4 mb-6 lg:-mx-8 lg:-mt-8 lg:mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 60%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-5 pt-6 pb-5 lg:px-10 lg:pt-9 lg:pb-8 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
              Configuración
            </p>
            <p className="text-sm text-white/45">
              Perfil, seguridad y apariencia de la aplicación
            </p>
          </div>
          <Settings size={40} strokeWidth={1.2} className="text-white/15 mt-0.5 shrink-0 lg:w-[52px] lg:h-[52px]" />
        </div>
      </div>

      <ConfiguracionClient
        email={user?.email ?? ''}
        createdAt={user?.created_at ?? null}
        hasProAccess={plan.has_pro_access}
      />
    </div>
  )
}
