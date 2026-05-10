import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

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

  const body = await req.json()
  const {
    tipo, nombre, fecha_inicio, fecha_vencimiento,
    moneda, capital_inicial, datos, notas,
    cuenta_origen_id,    // para auto-generar el movimiento de salida
    categoria_id,        // categoría del movimiento de salida
  } = body

  if (!tipo || capital_inicial === undefined) {
    return NextResponse.json({ error: 'Faltan campos obligatorios: tipo, capital_inicial' }, { status: 400 })
  }

  let movimiento_origen_id: string | null = null

  // ── 1. Registrar movimiento de salida (si hay cuenta origen) ──────────────
  if (cuenta_origen_id && capital_inicial > 0) {
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
        monto:           Math.abs(capital_inicial),
        moneda:          moneda ?? 'ARS',
        fecha:           fecha_inicio ?? new Date().toISOString().slice(0, 10),
        detalle:         detalleMovimiento,
        cuenta_origen:   cuenta_origen_id,
        categoria:       categoria_id ?? null,
        conciliado:      false,
        periodo_tarjeta: `${(fecha_inicio ?? new Date().toISOString()).slice(0, 7)}-01`,
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
      user_id:             user.id,
      tipo,
      nombre:              nombre ?? null,
      fecha_inicio:        fecha_inicio ?? new Date().toISOString().slice(0, 10),
      fecha_vencimiento:   fecha_vencimiento ?? null,
      moneda:              moneda ?? 'ARS',
      capital_inicial:     capital_inicial,
      valor_actual:        capital_inicial,   // al inicio, valor actual = capital
      estado:              'activo',
      datos:               datos ?? {},
      movimiento_origen_id,
      notas:               notas ?? null,
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
