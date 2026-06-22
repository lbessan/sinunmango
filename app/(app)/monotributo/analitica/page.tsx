// ─── /monotributo/analitica — Analítica de facturación ───────────────────────
// Server component: carga el histórico completo de facturas + el límite de la
// config, y delega el render reactivo (selector de año, gráficos) al client.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { getAuthedClient } from '@/lib/supabase/server'
import { AnaliticaFacturacionClient } from './analitica-client'
import type { FacturaEmitida } from '@/lib/monotributo'

export default async function MonotributoAnaliticaPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: facturasRaw }, { data: config }] = await Promise.all([
    supabase.from('facturas_emitidas').select('id, fecha, cliente, monto, concepto').eq('user_id', user.id).order('fecha'),
    supabase.from('monotributo_config').select('limite_facturacion_anual').eq('user_id', user.id).maybeSingle(),
  ])

  const facturas = (facturasRaw ?? []) as FacturaEmitida[]
  const limite   = (config as { limite_facturacion_anual: number } | null)?.limite_facturacion_anual ?? null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/monotributo" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={14} />Volver al dashboard
        </Link>
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 size={20} className="text-emerald-600" />
          Analítica de facturación
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Cómo evoluciona tu facturación a lo largo del tiempo</p>
      </div>

      {facturas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <p className="text-sm text-slate-400 mb-3">Todavía no hay facturas para analizar</p>
          <Link href="/monotributo" className="text-sm text-emerald-600 hover:underline">
            Cargá tus facturas primero →
          </Link>
        </div>
      ) : (
        <AnaliticaFacturacionClient facturas={facturas} limite={limite} />
      )}
    </div>
  )
}
