import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  validateString, validatePositiveNumber, validateEnum,
  validateInteger, validateId, optional,
} from '@/lib/validators'
import { revalidatePath } from 'next/cache'

const MONEDAS = ['ARS', 'USD'] as const

// ─── POST /api/ingresos-bulk ─────────────────────────────────────────────────
//
// Crea N movimientos de tipo Ingreso recurrentes, uno por mes, en el día
// indicado, empezando desde el mes elegido. Usado por la analítica para
// que el usuario cargue su sueldo + freelances + otros a futuro de un saque.
//
// Body:
//   {
//     cuenta_origen: UUID,
//     monto: number,
//     moneda: 'ARS' | 'USD',
//     detalle: string,
//     categoria?: UUID,
//     dia: 1-31,
//     mes_inicio: 'YYYY-MM',
//     cantidad_meses: 1-24,
//   }

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rl = await checkRateLimit(user.id, '/api/ingresos-bulk', { max: 5, windowSeconds: 60 })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const cuenta = validateId(b.cuenta_origen, 'cuenta_origen')
  if (!cuenta.ok) return NextResponse.json({ error: cuenta.error }, { status: 400 })

  const monto = validatePositiveNumber(b.monto, { field: 'monto' })
  if (!monto.ok) return NextResponse.json({ error: monto.error }, { status: 400 })

  const moneda = validateEnum(b.moneda, MONEDAS, 'moneda')
  if (!moneda.ok) return NextResponse.json({ error: moneda.error }, { status: 400 })

  const detalle = validateString(b.detalle, { max: 200, field: 'detalle' })
  if (!detalle.ok) return NextResponse.json({ error: detalle.error }, { status: 400 })

  const catOpt = optional(b.categoria, v => validateId(v, 'categoria'))
  if (!catOpt.ok) return NextResponse.json({ error: catOpt.error }, { status: 400 })

  const dia = validateInteger(b.dia, { min: 1, max: 31, field: 'dia' })
  if (!dia.ok) return NextResponse.json({ error: dia.error }, { status: 400 })

  const cantidad = validateInteger(b.cantidad_meses, { min: 1, max: 24, field: 'cantidad_meses' })
  if (!cantidad.ok) return NextResponse.json({ error: cantidad.error }, { status: 400 })

  const mesInicioStr = typeof b.mes_inicio === 'string' ? b.mes_inicio : ''
  if (!/^\d{4}-\d{2}$/.test(mesInicioStr)) {
    return NextResponse.json({ error: 'mes_inicio debe ser YYYY-MM' }, { status: 400 })
  }
  const [yInicio, mInicio] = mesInicioStr.split('-').map(Number)

  // ─── Construir las fechas ──
  const fechas: string[] = []
  for (let i = 0; i < cantidad.data; i++) {
    const year  = yInicio
    const month = mInicio - 1 + i
    const tentativeDate = new Date(year, month, dia.data)
    // Si el día no existe en ese mes (ej. 31 en Feb), usar último día del mes
    const ultimoDelMes = new Date(year, month + 1, 0).getDate()
    const diaFinal = Math.min(dia.data, ultimoDelMes)
    const fechaFinal = new Date(year, month, diaFinal)
    const iso = `${fechaFinal.getFullYear()}-${String(fechaFinal.getMonth() + 1).padStart(2, '0')}-${String(fechaFinal.getDate()).padStart(2, '0')}`
    fechas.push(iso)
  }

  // ─── Crear los movimientos en bulk ──
  const rows = fechas.map(fecha => ({
    id:              crypto.randomUUID(),
    fecha,
    detalle:         detalle.data,
    categoria:       catOpt.data,
    monto:           monto.data,
    moneda:          moneda.data,
    tipo_movimiento: 'Ingreso',
    cuenta_origen:   cuenta.data,
    conciliado:      false,
    user_id:         user.id,
    cuotas_total:    1,
    cuota_actual:    1,
    ciclo_actual:    1,
  }))

  const { error } = await supabase.from('movimientos').insert(rows as never)
  if (error) {
    console.error('[ingresos-bulk] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  revalidatePath('/analitica')
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')

  return NextResponse.json({ ok: true, creados: rows.length })
}
