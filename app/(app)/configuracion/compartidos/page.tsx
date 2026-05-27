import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CompartidosClient } from './client'

// ─── /configuracion/compartidos ─────────────────────────────────────────────
//
// Página dedicada para gestionar workspaces compartidos. Dos perspectivas:
//   - Compartiste con: shares OUTGOING que vos creaste (sos owner)
//   - Te compartieron: shares INCOMING aceptados donde sos invitee
//
// Acciones por share:
//   - Outgoing: editar role/recursos, copiar link, regenerar token (si
//     no fue aceptado todavía), revocar.
//   - Incoming: ver detalle del workspace, "dejar workspace" (mismo
//     endpoint DELETE — extendido para que el invitee también pueda
//     revocar SU acceso).

export const dynamic = 'force-dynamic'

export default async function CompartidosPage() {
  const { user } = await getAuthedClient()
  if (!user) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/configuracion"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Workspaces compartidos</h1>
          <p className="text-sm text-slate-500">
            Gestioná los accesos que diste y los que te dieron.
          </p>
        </div>
      </div>

      <CompartidosClient />
    </div>
  )
}
