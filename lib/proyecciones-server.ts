// ─── lib/proyecciones-server.ts ──────────────────────────────────────────────
//
// Orquestador ÚNICO de proyecciones (fetch + cálculo). Lo usan:
//   - app/(app)/dashboard/page.tsx  (banner, strip, mes futuro)
//   - app/api/dashboard-mobile      (proyectado del mes navegado)
//   - app/api/proyecciones          (API para clientes externos)
//
// Antes había TRES implementaciones divergentes que daban números distintos
// para el mismo mes. La matemática pura vive en lib/proyecciones.ts; acá solo
// el fetching.
//
// Decisiones (ver auditoría de proyecciones, ago-2026):
//   - Las tarjetas NO se filtran por activa: la deuda de una tarjeta dada de
//    baja se sigue debiendo (sus cuotas vivas cuentan).
//   - Montos vía monto_estimado de movimientos_completos (respeta cotización).
//   - Gastos fijos: por mes, solo los SIN movimiento vinculado (gasto_fijo_id).
//   - Gastos en cuentas no-tarjeta con período futuro también cuentan.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { todayPartsAR } from '@/lib/timezone'
import {
  calcularSaldoInicial,
  calcularSkipCount,
  calcularProyeccionesIterativo,
  resumirMesProyeccion,
  type GastoFijoConId,
  type MovMesInput,
  type ProyeccionMes,
} from '@/lib/proyecciones'

type DB = SupabaseClient<Database>

export type ProyeccionesResult = {
  saldoBase:      number
  startSaldo:     number
  saldoInicioMes: number
  datosDelMes: {
    totalIng:   number
    totalTC:    number
    totalOtros: number
    gfEfectivo: number
    gfTarjeta:  number
  }
  proyecciones: ProyeccionMes[]
  dolar:        number
}

const VACIO: ProyeccionesResult = {
  saldoBase: 0, startSaldo: 0, saldoInicioMes: 0,
  datosDelMes: { totalIng: 0, totalTC: 0, totalOtros: 0, gfEfectivo: 0, gfTarjeta: 0 },
  proyecciones: [], dolar: 1410,
}

/** Períodos YYYY-MM-01 para i = 1..n contando desde (y, m) — sin Date/toISOString
 *  (toISOString sobre medianoche local puede correr el mes según el TZ del server). */
export function periodosDesde(y: number, m: number, n: number): string[] {
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    const total = (m - 1) + i
    const yy = y + Math.floor(total / 12)
    const mm = (total % 12) + 1
    out.push(`${yy}-${String(mm).padStart(2, '0')}-01`)
  }
  return out
}

export async function calcularProyeccionesServer(
  supabase: DB,
  userId: string,
  desde: string,      // YYYY-MM del primer mes mostrado
  meses = 4,
): Promise<ProyeccionesResult> {
  const { year: cyAR, month: cmAR } = todayPartsAR()
  const [{ data: resumen }, { data: gastosFijosRaw }, { data: tarjetasRaw }, { data: params }] =
    await Promise.all([
      supabase.from('dashboard_resumen').select('*').eq('user_id', userId).single(),
      supabase.from('gastos_fijos').select('*, cuentas(tipo_cuenta)').eq('activo', true).eq('user_id', userId),
      // Sin filtro de activa: las cuotas de una tarjeta dada de baja se siguen pagando.
      supabase.from('cuentas').select('id').eq('tipo_cuenta', 'Tarjeta Credito').eq('user_id', userId),
      supabase.from('parametros').select('valor').eq('id', 'Dolar_Tarjeta_BNA').eq('user_id', userId).single(),
    ])
  if (!resumen) return VACIO

  const dolar      = params?.valor ?? 1410
  const tarjetaIds = new Set((tarjetasRaw ?? []).map(t => t.id))
  const startSaldo = calcularSaldoInicial(resumen)

  const gastosFijos: GastoFijoConId[] = (gastosFijosRaw ?? []).map(g => ({
    id:             g.id,
    monto_estimado: g.monto_estimado,
    moneda:         g.moneda,
    cuentas:        g.cuentas as { tipo_cuenta?: string | null } | null,
  }))

  const skipCount = calcularSkipCount({
    currentYear: cyAR, currentMonth: cmAR,
    desdeYear:   Number(desde.slice(0, 4)),
    desdeMonth:  Number(desde.slice(5, 7)),
  })
  const periodos = periodosDesde(cyAR, cmAR, skipCount + meses)

  const monthData = await Promise.all(periodos.map(async (periodo) => {
    const { data: movs, error } = await supabase
      .from('movimientos_completos')
      .select('tipo_movimiento, monto, monto_estimado, moneda, cuenta_origen, gasto_fijo_id')
      .eq('periodo_tarjeta', periodo)
      .eq('user_id', userId)
      .in('tipo_movimiento', ['Gasto', 'Ingreso'])
    // En un dashboard financiero, un error visible es preferible a números
    // errados en silencio (ej. si la vista aún no expone gasto_fijo_id porque
    // falta aplicar la migración: sin esto, TODOS los meses daban vacío).
    if (error) throw new Error(`proyecciones ${periodo}: ${error.message}`)
    return resumirMesProyeccion({
      periodo,
      movs: (movs ?? []) as MovMesInput[],
      gastosFijos,
      tarjetaIds,
      dolar,
    })
  }))

  const { saldoBase, saldoInicioMes, proyecciones, datosDelMes } =
    calcularProyeccionesIterativo({ startSaldo, skipCount, meses: monthData })

  return {
    saldoBase,
    startSaldo: Math.round(startSaldo),
    saldoInicioMes,
    datosDelMes,
    proyecciones,
    dolar,
  }
}
