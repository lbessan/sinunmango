import { adminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ConciliacionControls } from '@/components/conciliacion-controls'

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
  const { cuentaId, periodo } = await params

  const [{ data: cuenta }, { data: movimientos }, { data: categorias }, { data: subcategorias }] =
    await Promise.all([
      adminClient.from('cuentas').select('*').eq('id', cuentaId).single(),
      adminClient
        .from('movimientos_completos')
        .select('*')
        .eq('cuenta_origen', cuentaId)
        .eq('periodo_tarjeta', periodo)
        .eq('tipo_movimiento', 'Gasto')
        .order('fecha', { ascending: true }),
      adminClient
        .from('categorias')
        .select('id, nombre_categoria, icono, tipo_default')
        .eq('tipo_default', 'Gasto')
        .order('nombre_categoria'),
      adminClient
        .from('subcategorias')
        .select('id, categoria_padre, nombre_subcategoria'),
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
        movimientos={movimientos ?? []}
        cuentaId={cuentaId}
        periodo={periodo}
        categorias={categorias ?? []}
        subcategorias={subcategorias ?? []}
        cierreDay={cierreDay}
        venceDay={venceDay}
      />
    </div>
  )
}
