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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
