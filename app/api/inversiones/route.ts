import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validateEnum, validatePositiveNumber, validateISODate,
  validateId, optional,
  isPlainObject,
  type Validated,
} from '@/lib/validators'

const TIPOS_INVERSION = [
  'plazo_fijo', 'plazo_fijo_uva', 'fci', 'cedear', 'accion',
  'bono', 'on', 'crypto', 'dolar', 'otro',
] as const

const MONEDAS = ['ARS', 'USD'] as const

type InversionInsert = {
  tipo:              typeof TIPOS_INVERSION[number]
  nombre:            string | null
  fecha_inicio:      string
  fecha_vencimiento: string | null
  moneda:            'ARS' | 'USD'
  capital_inicial:   number
  datos:             Record<string, unknown>
  notas:             string | null
}

type ValidatedFull = InversionInsert & {
  cuenta_origen_id: string | null
  categoria_id:     string | null
}

function validateInversion(raw: unknown): Validated<ValidatedFull> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>

  const tipo = validateEnum(b.tipo, TIPOS_INVERSION, 'tipo')
  if (!tipo.ok) return tipo

  const capital = validatePositiveNumber(b.capital_inicial, { max: 10_000_000_000, field: 'capital_inicial' })
  if (!capital.ok) return capital

  const nombreOpt = optional(b.nombre, v => validateString(v, { max: 100, field: 'nombre' }))
  if (!nombreOpt.ok) return nombreOpt

  const fechaInicioOpt = optional(b.fecha_inicio, v => validateISODate(v, 'fecha_inicio'))
  if (!fechaInicioOpt.ok) return fechaInicioOpt

  const venceOpt = optional(b.fecha_vencimiento, v => validateISODate(v, 'fecha_vencimiento'))
  if (!venceOpt.ok) return venceOpt

  const monedaInput = b.moneda ?? 'ARS'
  const moneda = validateEnum(monedaInput, MONEDAS, 'moneda')
  if (!moneda.ok) return moneda

  // datos: objeto plano (puede contener cualquier campo específico del tipo de inversión)
  let datos: Record<string, unknown> = {}
  if (b.datos !== undefined && b.datos !== null) {
    if (!isPlainObject(b.datos)) return { ok: false, error: 'datos debe ser un objeto' }
    datos = b.datos
  }

  const notasOpt = optional(b.notas, v => validateString(v, { max: 1000, field: 'notas' }))
  if (!notasOpt.ok) return notasOpt

  // Para auto-registrar movimiento de salida (opcional)
  const cuentaOrigenOpt = optional(b.cuenta_origen_id, v => validateId(v, 'cuenta_origen_id'))
  if (!cuentaOrigenOpt.ok) return cuentaOrigenOpt
  const categoriaOpt = optional(b.categoria_id, v => validateId(v, 'categoria_id'))
  if (!categoriaOpt.ok) return categoriaOpt

  return {
    ok: true,
    data: {
      tipo:              tipo.data,
      nombre:            nombreOpt.data,
      fecha_inicio:      fechaInicioOpt.data ?? new Date().toISOString().slice(0, 10),
      fecha_vencimiento: venceOpt.data,
      moneda:            moneda.data,
      capital_inicial:   capital.data,
      datos,
      notas:             notasOpt.data,
      cuenta_origen_id:  cuentaOrigenOpt.data,
      categoria_id:      categoriaOpt.data,
    },
  }
}

// ─── GET /api/inversiones ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('inversiones')
    .select('*')
    .eq('user_id', user.id)
    .neq('estado', 'liquidado')
    .order('fecha_inicio', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// ─── POST /api/inversiones ────────────────────────────────────────────────────
// Crea la inversión y, si se pasa cuenta_origen_id, registra el movimiento de salida.
export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateInversion(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const {
    tipo, nombre, fecha_inicio, fecha_vencimiento,
    moneda, capital_inicial, datos, notas,
    cuenta_origen_id, categoria_id,
  } = v.data

  let movimiento_origen_id: string | null = null

  // ── 1. Registrar movimiento de salida (si hay cuenta origen) ──────────────
  if (cuenta_origen_id) {
    const labelTipo: Record<string, string> = {
      plazo_fijo:     'Plazo Fijo',
      plazo_fijo_uva: 'Plazo Fijo UVA',
      fci:            'FCI',
      cedear:         'CEDEAR',
      accion:         'Acción',
      bono:           'Bono',
      on:             'ON',
      crypto:         'Crypto',
      dolar:          'Dólar',
      otro:           'Inversión',
    }
    const detalleMovimiento = nombre || `${labelTipo[tipo] ?? 'Inversión'} — capital inicial`

    const { data: mov, error: movErr } = await supabase
      .from('movimientos')
      .insert({
        id:              crypto.randomUUID(),
        user_id:         user.id,
        tipo_movimiento: 'Gasto',
        monto:           capital_inicial,
        moneda,
        fecha:           fecha_inicio,
        detalle:         detalleMovimiento,
        cuenta_origen:   cuenta_origen_id,
        categoria:       categoria_id,
        conciliado:      false,
        periodo_tarjeta: `${fecha_inicio.slice(0, 7)}-01`,
      })
      .select('id')
      .single()

    if (movErr) {
      return NextResponse.json({ error: `Error al registrar movimiento: ${movErr.message}` }, { status: 400 })
    }
    movimiento_origen_id = mov.id
  }

  // ── 2. Crear la inversión ─────────────────────────────────────────────────
  const { data: inv, error: invErr } = await supabase
    .from('inversiones')
    .insert({
      user_id:           user.id,
      tipo,
      nombre,
      fecha_inicio,
      fecha_vencimiento,
      moneda,
      capital_inicial,
      valor_actual:      capital_inicial,   // al inicio, valor actual = capital
      estado:            'activo',
      datos,
      movimiento_origen_id,
      notas,
    })
    .select('*')
    .single()

  if (invErr) {
    // Rollback: eliminar el movimiento si falló la inversión
    if (movimiento_origen_id) {
      await supabase.from('movimientos').delete().eq('id', movimiento_origen_id).eq('user_id', user.id)
    }
    return NextResponse.json({ error: invErr.message }, { status: 400 })
  }

  return NextResponse.json(inv, { status: 201 })
}
