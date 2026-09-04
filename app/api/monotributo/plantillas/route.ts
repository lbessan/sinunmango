// ─── /api/monotributo/plantillas ─────────────────────────────────────────────
// GET  → lista las plantillas de factura del usuario, en su orden.
// POST → crea/actualiza una plantilla (dedup por nombre, igual que clientes).

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { normalizarItems, type PeriodoModo } from '@/lib/monotributo-plantillas'

const MODOS: PeriodoModo[] = ['mes_actual', 'mes_anterior', 'dia_emision']
const ITEMS_MAX = 30

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data, error } = await supabase
    .from('factura_plantillas').select('*').eq('user_id', user.id)
    .order('orden').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ plantillas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>

  const nombre = String(raw.nombre ?? '').trim().slice(0, 120)
  if (!nombre) return NextResponse.json({ error: 'Ponele un nombre a la plantilla' }, { status: 400 })

  const items = normalizarItems(raw.items)
  if (items.length === 0) return NextResponse.json({ error: 'La plantilla necesita al menos un ítem' }, { status: 400 })
  if (items.length > ITEMS_MAX) return NextResponse.json({ error: `Máximo ${ITEMS_MAX} ítems` }, { status: 400 })

  const modo = String(raw.periodo_modo ?? 'mes_actual') as PeriodoModo
  if (!MODOS.includes(modo)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })

  const concepto = Number(raw.concepto ?? 2)
  if (![1, 2, 3].includes(concepto)) return NextResponse.json({ error: 'Concepto inválido' }, { status: 400 })

  const dias = Number(raw.dias_vto_pago ?? 7)
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
    return NextResponse.json({ error: 'Días de vencimiento inválidos' }, { status: 400 })
  }

  const { data, error } = await supabase.from('factura_plantillas').upsert({
    user_id:        user.id,
    nombre,
    cliente_nombre: raw.cliente_nombre ? String(raw.cliente_nombre).slice(0, 200) : null,
    doc_tipo:       raw.doc_tipo != null && raw.doc_tipo !== '' ? Number(raw.doc_tipo) : null,
    doc_nro:        raw.doc_nro != null ? (String(raw.doc_nro).replace(/\D/g, '') || null) : null,
    condicion_iva:  raw.condicion_iva != null && raw.condicion_iva !== '' ? Number(raw.condicion_iva) : null,
    concepto,
    pto_vta:        raw.pto_vta != null && raw.pto_vta !== '' ? Number(raw.pto_vta) : null,
    items,
    periodo_modo:   modo,
    dias_vto_pago:  dias,
    orden:          Number(raw.orden) || 0,
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'user_id,nombre' }).select().maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ plantilla: data })
}
