import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { getCurrentWorkspace } from '@/lib/workspace'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ConciliacionControls } from '@/components/conciliacion-controls'

type ConcProps = ComponentProps<typeof ConciliacionControls>

function formatPeriodo(p: string) {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

export default async function ConciliacionDetallePage({
  params,
}: {
  params: Promise<{ cuentaId: string; periodo: string }>
}) {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')
  const workspace = await getCurrentWorkspace(user.id)
  const wsId = workspace.ownerUserId

  const { cuentaId, periodo } = await params

  // 1) Cargamos familia primero (necesaria para saber qué cuenta_origen
  // ids buscar en los movs). Familia = principal (cuentaId) + adicionales.
  const { data: familia } = await supabase
    .from('cuentas')
    .select('id, nombre_cuenta, nombre_titular, tarjeta_principal_id')
    .eq('user_id', wsId)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .or(`id.eq.${cuentaId},tarjeta_principal_id.eq.${cuentaId}`)

  type FamiliaRow = { id: string; nombre_cuenta: string | null; nombre_titular: string | null; tarjeta_principal_id: string | null }
  const familiaRows = (familia ?? []) as unknown as FamiliaRow[]
  const cuentasFamilia = familiaRows.map(r => ({
    id:              r.id,
    nombre_cuenta:   r.nombre_cuenta ?? '',
    nombre_titular:  r.nombre_titular,
    isPrincipal:     r.tarjeta_principal_id === null,
  }))
  const familiaIds = familiaRows.map(r => r.id)

  // 2) Resto en paralelo. Los movs ahora se traen por TODA la familia —
  // si el user cargó un mov manualmente con cuenta_origen=adicional,
  // tiene que aparecer en la conciliación de la principal. RLS asegura
  // que solo se trae lo que el user puede ver.
  // Movs scoped por cuenta (no user_id) → RLS permite mis propios movs +
  // movs en cuentas compartidas (workspace V2).
  const [{ data: cuenta }, { data: movimientos }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      supabase.from('cuentas').select('*').eq('id', cuentaId).eq('user_id', wsId).single(),
      supabase
        .from('movimientos_completos')
        .select('*')
        .in('cuenta_origen', familiaIds.length > 0 ? familiaIds : [cuentaId])
        .eq('periodo_tarjeta', periodo)
        .in('tipo_movimiento', ['Gasto', 'Ingreso'])
        .order('fecha', { ascending: true }),
      supabase
        .from('categorias')
        .select('id, nombre_categoria, icono, tipo_default')
        .eq('user_id', wsId)
        .order('nombre_categoria'),
      supabase
        .from('subcategorias')
        .select('id, categoria_padre, nombre_subcategoria')
        .eq('user_id', wsId),
    ])

  if (!cuenta) notFound()

  // Extraer día de cierre y vencimiento
  const cierreDay = cuenta.fecha_cierre_tarjeta
    ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate()
    : null
  const venceDay = cuenta.fecha_vencimiento_tarjeta
    ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate()
    : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/conciliaciones?periodo=${periodo}`} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-slate-200 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {cuenta.nombre_cuenta} · {formatPeriodo(periodo)}
          </h1>
          <p className="text-sm text-slate-400">
            Comparar resumen con movimientos cargados
            {cierreDay && venceDay && ` · Cierre día ${cierreDay} · Vence día ${venceDay}`}
          </p>
        </div>
      </div>

      <ConciliacionControls
        movimientos={(movimientos ?? []) as ConcProps['movimientos']}
        cuentaId={cuentaId}
        periodo={periodo}
        categorias={(categorias ?? []) as ConcProps['categorias']}
        subcategorias={(subcategorias ?? []) as ConcProps['subcategorias']}
        cierreDay={cierreDay}
        venceDay={venceDay}
        cuentasFamilia={cuentasFamilia}
      />
    </div>
  )
}
