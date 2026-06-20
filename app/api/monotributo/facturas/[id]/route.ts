import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import {
  validateString, validatePositiveNumber, validateISODate,
  optional, isPlainObject,
  type Validated,
} from '@/lib/validators'

type FacturaUpdate = Partial<{
  fecha:              string
  cliente:            string
  concepto:           string | null
  monto:              number
  numero_comprobante: string | null
  tipo_comprobante:   string | null
  notas:              string | null
}>

// Validación PATCH — todos los campos opcionales, pero al menos uno presente.
function validateFacturaUpdate(raw: unknown): Validated<FacturaUpdate> {
  if (!isPlainObject(raw)) return { ok: false, error: 'Body inválido' }
  const out: FacturaUpdate = {}

  if ('fecha' in raw) {
    const r = validateISODate(raw.fecha, 'fecha')
    if (!r.ok) return r
    out.fecha = r.data
  }
  if ('cliente' in raw) {
    const r = validateString(raw.cliente, { min: 1, max: 200, field: 'cliente' })
    if (!r.ok) return r
    out.cliente = r.data
  }
  if ('monto' in raw) {
    const r = validatePositiveNumber(raw.monto, { max: 1_000_000_000, field: 'monto' })
    if (!r.ok) return r
    out.monto = r.data
  }
  if ('concepto' in raw) {
    const r = optional(raw.concepto, v => validateString(v, { min: 1, max: 500, field: 'concepto' }))
    if (!r.ok) return r
    out.concepto = r.data ?? null
  }
  if ('numero_comprobante' in raw) {
    const r = optional(raw.numero_comprobante, v => validateString(v, { min: 1, max: 50, field: 'número de comprobante' }))
    if (!r.ok) return r
    out.numero_comprobante = r.data ?? null
  }
  if ('tipo_comprobante' in raw) {
    const r = optional(raw.tipo_comprobante, v => validateString(v, { min: 1, max: 4, field: 'tipo de comprobante' }))
    if (!r.ok) return r
    out.tipo_comprobante = r.data ?? null
  }
  if ('notas' in raw) {
    const r = optional(raw.notas, v => validateString(v, { min: 1, max: 500, field: 'notas' }))
    if (!r.ok) return r
    out.notas = r.data ?? null
  }

  if (Object.keys(out).length === 0) return { ok: false, error: 'Sin campos para actualizar' }
  return { ok: true, data: out }
}

// ─── GET /api/monotributo/facturas/[id] ──────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await ctx.params

  const { data, error } = await supabase
    .from('facturas_emitidas')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(data)
}

// ─── PATCH /api/monotributo/facturas/[id] ────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await ctx.params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validateFacturaUpdate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('facturas_emitidas')
    .update(v.data)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// ─── DELETE /api/monotributo/facturas/[id] ───────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await ctx.params

  const { error } = await supabase
    .from('facturas_emitidas')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
