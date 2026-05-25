import { getAuthedClient } from '@/lib/supabase/server'
import { getUserPlan } from '@/lib/subscription'
import { redirect } from 'next/navigation'
import { ConfiguracionClient } from '@/components/configuracion-client'
import { ShareWorkspaceTrigger } from '@/components/share-workspace-trigger'
import { Settings, Share2 } from 'lucide-react'

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

      {/* ── Compartir workspace (solo Pro) ─────────────────────────────────
          La Pro gate la hace el endpoint (devuelve requires_pro si no);
          mostramos el botón siempre para que los Free vean la feature y
          se enteren de que existe. */}
      <section className="max-w-4xl mx-auto px-4 lg:px-0 mt-8 mb-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                 style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
              <Share2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 mb-1">Compartir tu workspace</h3>
              <p className="text-sm text-slate-500 mb-4">
                Invitá a alguien (tu pareja, un familiar, tu contador) a tu workspace.
                Elegís qué cuentas, tarjetas, gastos fijos e inversiones puede ver
                — y si puede solo mirar o también cargar movimientos.
              </p>
              <ShareWorkspaceTrigger />
              {!plan.has_pro_access && (
                <p className="text-xs text-slate-400 mt-3">
                  Compartir es una feature Pro. Necesitás Pro activo para generar invitaciones.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
