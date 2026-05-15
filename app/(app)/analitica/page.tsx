import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { getUserPlan } from '@/lib/subscription'
import { redirect } from 'next/navigation'
import { BarChart2 } from 'lucide-react'
import { AnaliticaShell } from '@/components/analitica/analitica-shell'

type ShellProps = ComponentProps<typeof AnaliticaShell>

export default async function AnaliticaPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  // Plan del usuario — feature AI gateada por Pro
  const plan = await getUserPlan(supabase)

  // Traemos historia de los últimos 36 meses + límite duro de 20k filas.
  // Antes traíamos TODO el histórico sin filtro → para users con muchos años
  // la página se volvía pesada de cargar (RSC payload grande + procesamiento
  // client-side). 36 meses cubre las comparativas estándar (este mes vs hace
  // 1 año, trends 2-3 años). Para users con > 36 meses, históricos viejos
  // siguen accesibles desde /movimientos.
  //
  // TODO: largo plazo, una vista materializada con agregados mensuales por
  // categoría es más eficiente que filtrar movimientos crudos.
  const desdeHace36Meses = new Date()
  desdeHace36Meses.setMonth(desdeHace36Meses.getMonth() - 36)
  const desdeISO = desdeHace36Meses.toISOString().slice(0, 10)

  const [
    { data: movimientos },
    { data: subcategorias },
    { data: cuentas },
    { data: categorias },
  ] = await Promise.all([
    supabase
      .from('movimientos_completos')
      .select('id, fecha, tipo_movimiento, monto, monto_estimado, detalle, categoria_nombre, categoria_icono, subcategoria, cuotas_total, grupo_cuotas, cuenta_origen_nombre, cuenta_origen_tipo')
      .eq('user_id', user.id)
      .in('tipo_movimiento', ['Ingreso', 'Gasto'])
      .gte('fecha', desdeISO)
      .order('fecha', { ascending: true })
      .limit(20_000),
    supabase
      .from('subcategorias')
      .select('id, nombre_subcategoria, categoria_padre')
      .eq('user_id', user.id),
    supabase
      .from('cuentas')
      .select('id, nombre_cuenta, tipo_cuenta')
      .eq('activa', true)
      .eq('user_id', user.id)
      .order('nombre_cuenta'),
    supabase
      .from('categorias')
      .select('id, nombre_categoria, icono, tipo_default')
      .eq('user_id', user.id)
      .order('nombre_categoria'),
  ])

  return (
    <div>
      {/* ── Banner full-bleed ───────────────────────────────────────────── */}
      <div
        className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6 lg:mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 50%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-5 pt-6 pb-6 lg:px-10 lg:pt-9 lg:pb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
              Analítica
            </p>
            <p className="text-sm text-white/45">
              Tu historia financiera, contada con datos
            </p>
          </div>
          <BarChart2 size={52} strokeWidth={1.2} className="text-white/15 mt-1 hidden sm:block" />
        </div>
      </div>

      <AnaliticaShell
        movimientos={(movimientos ?? []) as ShellProps['movimientos']}
        subcategorias={(subcategorias ?? []) as ShellProps['subcategorias']}
        cuentas={(cuentas ?? []) as ShellProps['cuentas']}
        categorias={(categorias ?? []) as ShellProps['categorias']}
        hasProAccess={plan.has_pro_access}
      />
    </div>
  )
}
