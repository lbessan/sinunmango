import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'

// ─── POST /api/asistente-accion ───────────────────────────────────────────────
// Ejecuta una acción parseada desde la respuesta del asistente IA (Manguito).
// Hoy solo soporta: nuevo_movimiento.
//
// Importante: el payload viene de un LLM. Validamos TODO antes de tocar la DB
// (cuotas, monto, moneda, IDs, fecha, detalle). Una alucinación o cliente
// malicioso no debe poder insertar basura ni acceder a datos de otro usuario.
// RLS hace cumplir ownership de cuenta y categoría también a nivel DB.

type AccionMovimiento = {
  tipo:         'nuevo_movimiento'
  detalle:      string
  monto:        number
  moneda:       'ARS' | 'USD'
  cuotas:       number
  cuenta_id:    string
  categoria_id: string
  fecha:        string  // YYYY-MM-DD
}

// ─── Validación ───────────────────────────────────────────────────────────────
const ID_PATTERN     = /^[a-zA-Z0-9_-]{1,64}$/      // cta_xxx, UUIDs, etc.
const FECHA_PATTERN  = /^\d{4}-\d{2}-\d{2}$/        // ISO date
const MONTO_MAX      = 1_000_000_000                // defensa contra overflow / typos
const CUOTAS_MAX     = 60                            // 5 años de cuotas mensuales
const DETALLE_MAX    = 200

type Validated =
  | { ok: true;  accion: AccionMovimiento }
  | { ok: false; error: string }

function validateAccion(raw: unknown): Validated {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Body inválido' }
  }
  const a = raw as Record<string, unknown>

  if (a.tipo !== 'nuevo_movimiento') {
    return { ok: false, error: 'Tipo de acción no soportado' }
  }
  if (typeof a.detalle !== 'string') {
    return { ok: false, error: 'Detalle inválido' }
  }
  const detalleClean = a.detalle.trim()
  if (detalleClean.length === 0) {
    return { ok: false, error: 'Detalle es requerido' }
  }
  if (detalleClean.length > DETALLE_MAX) {
    return { ok: false, error: `Detalle demasiado largo (máx ${DETALLE_MAX} caracteres)` }
  }
  if (typeof a.monto !== 'number' || !Number.isFinite(a.monto)) {
    return { ok: false, error: 'Monto inválido' }
  }
  if (a.monto <= 0) {
    return { ok: false, error: 'Monto debe ser mayor a 0' }
  }
  if (a.monto > MONTO_MAX) {
    return { ok: false, error: 'Monto fuera de rango' }
  }
  if (a.moneda !== 'ARS' && a.moneda !== 'USD') {
    return { ok: false, error: 'Moneda inválida (debe ser ARS o USD)' }
  }
  if (typeof a.cuotas !== 'number' || !Number.isInteger(a.cuotas)) {
    return { ok: false, error: 'Cuotas inválidas' }
  }
  if (a.cuotas < 1 || a.cuotas > CUOTAS_MAX) {
    return { ok: false, error: `Cuotas debe estar entre 1 y ${CUOTAS_MAX}` }
  }
  if (typeof a.cuenta_id !== 'string' || !ID_PATTERN.test(a.cuenta_id)) {
    return { ok: false, error: 'ID de cuenta inválido' }
  }
  if (typeof a.categoria_id !== 'string' || !ID_PATTERN.test(a.categoria_id)) {
    return { ok: false, error: 'ID de categoría inválido' }
  }
  if (typeof a.fecha !== 'string' || !FECHA_PATTERN.test(a.fecha)) {
    return { ok: false, error: 'Fecha inválida (formato esperado YYYY-MM-DD)' }
  }
  const dt = new Date(a.fecha + 'T12:00:00')
  if (isNaN(dt.getTime())) {
    return { ok: false, error: 'Fecha inválida' }
  }

  return {
    ok: true,
    accion: {
      tipo:         'nuevo_movimiento',
      detalle:      detalleClean,
      monto:        a.monto,
      moneda:       a.moneda,
      cuotas:       a.cuotas,
      cuenta_id:    a.cuenta_id,
      categoria_id: a.categoria_id,
      fecha:        a.fecha,
    },
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function calcularPeriodo(
  fecha: string,
  cierre: number | null,
  vence: number | null,
  esTarjeta: boolean
): string {
  const d    = new Date(fecha + 'T12:00:00')
  let mes    = d.getMonth()
  let anio   = d.getFullYear()
  if (esTarjeta && cierre && vence) {
    const day = d.getDate()
    if (day <= cierre) {
      if (vence <= cierre) mes++
    } else {
      if (vence > cierre) mes++
      else mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function addMonths(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00')
  dt.setMonth(dt.getMonth() + n)
  return dt.toISOString().slice(0, 10)
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parsear body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Validar
  const v = validateAccion(body)
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 })
  }
  const accion = v.accion

  // Validar que cuenta + categoría pertenezcan al user (en paralelo).
  // RLS también lo asegura, pero hacemos los chequeos para devolver 404 explícito.
  const [cuentaRes, categoriaRes] = await Promise.all([
    supabase
      .from('cuentas')
      .select('id, tipo_cuenta, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta, nombre_cuenta')
      .eq('id', accion.cuenta_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('categorias')
      .select('id')
      .eq('id', accion.categoria_id)
      .eq('user_id', user.id)
      .single(),
  ])

  const cuenta = cuentaRes.data
  if (!cuenta) {
    return NextResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 })
  }
  if (!categoriaRes.data) {
    return NextResponse.json({ error: 'Categoría no encontrada.' }, { status: 404 })
  }

  // Construir movimientos (con cuotas)
  const isTarjeta  = cuenta.tipo_cuenta === 'Tarjeta Credito'
  const cierre     = cuenta.fecha_cierre_tarjeta
    ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
  const vence      = cuenta.fecha_vencimiento_tarjeta
    ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
  const cuotas     = accion.cuotas
  const montoCuota = accion.monto / cuotas

  const records = Array.from({ length: cuotas }, (_, i) => {
    const fechaCuota = addMonths(accion.fecha, i)
    return {
      id:              crypto.randomUUID(),
      fecha:           fechaCuota,
      detalle:         cuotas > 1 ? `${accion.detalle} (Cuota ${i + 1}/${cuotas})` : accion.detalle,
      monto:           montoCuota,
      moneda:          accion.moneda,
      tipo_movimiento: 'Gasto',
      cuenta_origen:   accion.cuenta_id,
      cuenta_destino:  null,
      categoria:       accion.categoria_id,
      subcategoria:    null,
      cotizacion:      null,
      conciliado:      false,
      periodo_tarjeta: calcularPeriodo(fechaCuota, cierre, vence, isTarjeta && accion.moneda !== 'USD'),
      cuotas_total:    cuotas,
      cuota_actual:    i + 1,
      ciclo_actual:    1,
      user_id:         user.id,
    }
  })

  const { error } = await supabase.from('movimientos').insert(records)
  if (error) {
    console.error('[asistente-accion] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:     true,
    cuenta: cuenta.nombre_cuenta,
    cuotas,
    monto:  accion.monto,
  })
}
