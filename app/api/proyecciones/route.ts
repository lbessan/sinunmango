import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { todayPartsAR } from '@/lib/timezone'
import { calcularProyeccionesServer } from '@/lib/proyecciones-server'

// GET /api/proyecciones?meses=N
//
// Delgado sobre lib/proyecciones-server — la MISMA implementación que usa el
// dashboard web y el mobile. Antes esta ruta tenía su propia fórmula (divergía:
// no restaba gastos fijos de tarjeta ni gastos fuera de tarjeta) y daba números
// distintos a los del dashboard para el mismo mes.
//
// Se mantiene la forma de la respuesta por compatibilidad con clientes
// existentes (app mobile): proyectado_actual, proyecciones[{periodo, label,
// ingresos, gastos_fijos, gastos_tarjeta, proyeccion}].

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const mesesParam = Number(req.nextUrl.searchParams.get('meses') ?? 4)
  const meses      = Math.min(24, Math.max(1, Number.isFinite(mesesParam) ? mesesParam : 4))

  const { year, month } = todayPartsAR()
  const desde = `${year}-${String(month).padStart(2, '0')}`

  // Con desde = mes actual, skipCount es 0 y NO se consume ningún período:
  // calcularProyeccionesServer devuelve exactamente `meses` proyecciones
  // (mes siguiente .. mes+meses). No "compensar" con +1.
  const r = await calcularProyeccionesServer(supabase, user.id, desde, meses)

  return NextResponse.json({
    proyectado_actual: r.saldoBase,
    proyecciones: r.proyecciones.map(pm => ({
      periodo:        pm.periodo,
      label:          pm.label,
      ingresos:       pm.ingresos,
      gastos_fijos:   pm.gastos_fijos,
      gastos_tarjeta: pm.gastos_tarjeta,
      gastos_otros:   pm.gastos_otros,
      proyeccion:     pm.proyeccion,
    })),
  })
}
