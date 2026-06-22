import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validatePositiveNumber, validateISODate,
  optional, isPlainObject,
  type Validated,
} from '@/lib/validators'

type FacturaInsert = {
  fecha:              string
  cliente:            string
  concepto:           string | null
  monto:              number
  numero_comprobante: string | null
  tipo_comprobante:   string | null
  notas:              string | null
  // Campos que vienen del parseo de PDF (todos opcionales)
  cae:                string | null
  cae_vencimiento:    string | null
  cliente_cuit:       string | null
  periodo_desde:      string | null
  periodo_hasta:      string | null
  punto_venta:        string | null
}

function validateFactura(raw: unknown): Validated<FacturaInsert> {
  if (!isPlainObject(raw)) return { ok: false, error: 'Body inválido' }

  const fecha = validateISODate(raw.fecha, 'fecha')
  if (!fecha.ok) return fecha

  const cliente = validateString(raw.cliente, { min: 1, max: 200, field: 'cliente' })
  if (!cliente.ok) return cliente

  const monto = validatePositiveNumber(raw.monto, { max: 1_000_000_000, field: 'monto' })
  if (!monto.ok) return monto

  const conceptoRes = optional(raw.concepto, v => validateString(v, { min: 1, max: 500, field: 'concepto' }))
  if (!conceptoRes.ok) return conceptoRes

  const numeroRes = optional(raw.numero_comprobante, v => validateString(v, { min: 1, max: 50, field: 'número de comprobante' }))
  if (!numeroRes.ok) return numeroRes

  const tipoRes = optional(raw.tipo_comprobante, v => validateString(v, { min: 1, max: 4, field: 'tipo de comprobante' }))
  if (!tipoRes.ok) return tipoRes

  const notasRes = optional(raw.notas, v => validateString(v, { min: 1, max: 500, field: 'notas' }))
  if (!notasRes.ok) return notasRes

  // ── Campos del PDF (opcionales) ──
  const caeRes = optional(raw.cae, v => validateString(v, { min: 1, max: 20, field: 'CAE' }))
  if (!caeRes.ok) return caeRes

  const caeVtoRes = optional(raw.cae_vencimiento, v => validateISODate(v, 'vencimiento CAE'))
  if (!caeVtoRes.ok) return caeVtoRes

  const cuitRes = optional(raw.cliente_cuit, v => validateString(v, { min: 1, max: 20, field: 'CUIT cliente' }))
  if (!cuitRes.ok) return cuitRes

  const periodoDesdeRes = optional(raw.periodo_desde, v => validateISODate(v, 'período desde'))
  if (!periodoDesdeRes.ok) return periodoDesdeRes

  const periodoHastaRes = optional(raw.periodo_hasta, v => validateISODate(v, 'período hasta'))
  if (!periodoHastaRes.ok) return periodoHastaRes

  const pvRes = optional(raw.punto_venta, v => validateString(v, { min: 1, max: 10, field: 'punto de venta' }))
  if (!pvRes.ok) return pvRes

  return {
    ok: true,
    data: {
      fecha:              fecha.data,
      cliente:            cliente.data,
      concepto:           conceptoRes.data ?? null,
      monto:              monto.data,
      numero_comprobante: numeroRes.data ?? null,
      tipo_comprobante:   tipoRes.data ?? 'C',
      notas:              notasRes.data ?? null,
      cae:                caeRes.data ?? null,
      cae_vencimiento:    caeVtoRes.data ?? null,
      cliente_cuit:       cuitRes.data ?? null,
      periodo_desde:      periodoDesdeRes.data ?? null,
      periodo_hasta:      periodoHastaRes.data ?? null,
      punto_venta:        pvRes.data ?? null,
    },
  }
}

// ─── GET /api/monotributo/facturas ───────────────────────────────────────────
// Query params:
//   desde, hasta — opcionales (ISO date)
export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  let query = supabase
    .from('facturas_emitidas')
    .select('*')
    .eq('user_id', user.id)
    .order('fecha', { ascending: false })

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// ─── POST /api/monotributo/facturas ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateFactura(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('facturas_emitidas')
    .insert({ user_id: user.id, ...v.data })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation. Si el CAE ya existe (dedup), damos mensaje claro.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'duplicate_cae', message: 'Ya cargaste una factura con este CAE.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json(data, { status: 201 })
}
