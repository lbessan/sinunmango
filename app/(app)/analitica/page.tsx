import type { ComponentProps } from 'react'
import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AnaliticaCharts } from '@/components/analitica-charts'
import { BarChart2 } from 'lucide-react'

type AnaliticaProps = ComponentProps<typeof AnaliticaCharts>

export default async function AnaliticaPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const [{ data: movimientos }, { data: subcategorias }] = await Promise.all([
    supabase
      .from('movimientos_completos')
      .select('id, fecha, tipo_movimiento, monto, monto_estimado, detalle, categoria_nombre, categoria_icono, subcategoria')
      .eq('user_id', user.id)
      .in('tipo_movimiento', ['Ingreso', 'Gasto'])
      .order('fecha', { ascending: true }),
    supabase
      .from('subcategorias')
      .select('id, nombre_subcategoria, categoria_padre')
      .eq('user_id', user.id),
  ])

  return (
    <div>
      {/* ── Banner full-bleed ───────────────────────────────────────────── */}
      <div
        className="-mx-8 -mt-8 mb-8 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #0b2d55) 50%, var(--accent, #0f4d3a) 100%)' }}
      >
        <div className="px-10 pt-9 pb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1.5">
              Analítica
            </p>
            <p className="text-sm text-white/45">
              Visualizá tus finanzas y detectá tendencias
            </p>
          </div>
          <BarChart2 size={52} strokeWidth={1.2} className="text-white/15 mt-1" />
        </div>
      </div>

      <AnaliticaCharts
        movimientos={(movimientos ?? []) as AnaliticaProps['movimientos']}
        subcategorias={(subcategorias ?? []) as AnaliticaProps['subcategorias']}
      />
    </div>
  )
}
