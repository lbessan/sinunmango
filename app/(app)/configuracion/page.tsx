import { createClient } from '@/lib/supabase/server'
import { ConfiguracionClient } from '@/components/configuracion-client'
import { Settings } from 'lucide-react'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      {/* ── Banner full-bleed ────────────────────────────────────────────── */}
      <div
        className="-mx-8 -mt-8 mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 60%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-10 pt-9 pb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
              Configuración
            </p>
            <p className="text-sm text-white/45">
              Perfil, seguridad y apariencia de la aplicación
            </p>
          </div>
          <Settings size={52} strokeWidth={1.2} className="text-white/15 mt-1" />
        </div>
      </div>

      <ConfiguracionClient
        email={user?.email ?? ''}
        createdAt={user?.created_at ?? null}
      />
    </div>
  )
}
