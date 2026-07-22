// ─── /api/monotributo/afip/emitir ────────────────────────────────────────────
//
// GET  → lista los puntos de venta habilitados para Web Services.
// POST → emite una Factura C (wsfe) con el certificado y la guarda con su CAE.
//        Emite un documento fiscal REAL — la UI confirma antes.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { puntosDeVenta, emitirYGuardar, type EmitirInput } from '@/lib/afip/facturacion'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    return NextResponse.json({ ptosVenta: await puntosDeVenta(supabase, user.id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>

  const concepto = Number(raw.concepto)
  const ptoVta = Number(raw.ptoVta)
  const docTipo = Number(raw.docTipo ?? 99)
  const docNro = Number(raw.docNro ?? 0)

  // Ítems: [{ descripcion, cantidad, precio }]. Si no hay, cae a `importe`.
  const rawItems = Array.isArray(raw.items) ? raw.items : []
  const items = rawItems
    .map(it => {
      const o = (it ?? {}) as Record<string, unknown>
      return { descripcion: String(o.descripcion ?? '').trim(), cantidad: Number(o.cantidad) || 0, precio: Number(o.precio) || 0 }
    })
    .filter(it => it.precio > 0 && it.cantidad > 0)
  const importe = Number(raw.importe)
  const total = items.length
    ? items.reduce((s, it) => s + it.cantidad * it.precio, 0)
    : importe

  if (![1, 2, 3].includes(concepto)) return NextResponse.json({ error: 'Concepto inválido' }, { status: 400 })
  if (!Number.isInteger(ptoVta) || ptoVta <= 0) return NextResponse.json({ error: 'Punto de venta inválido' }, { status: 400 })
  if (!Number.isFinite(total) || total <= 0) return NextResponse.json({ error: 'Cargá al menos un ítem con importe' }, { status: 400 })
  if (docTipo !== 99 && (!Number.isFinite(docNro) || docNro <= 0)) {
    return NextResponse.json({ error: 'Falta el CUIT/documento del cliente' }, { status: 400 })
  }

  const input: EmitirInput = {
    ptoVta,
    concepto: concepto as 1 | 2 | 3,
    docTipo,
    docNro,
    cliente: String(raw.cliente ?? ''),
    condicionIvaReceptor: raw.condicionIvaReceptor != null ? Number(raw.condicionIvaReceptor) : undefined,
    items: items.length ? items : undefined,
    importe: items.length ? undefined : Number(total.toFixed(2)),
    fecha: typeof raw.fecha === 'string' && raw.fecha ? raw.fecha : undefined,
    fchServDesde: typeof raw.fchServDesde === 'string' ? raw.fchServDesde : undefined,
    fchServHasta: typeof raw.fchServHasta === 'string' ? raw.fchServHasta : undefined,
    fchVtoPago: typeof raw.fchVtoPago === 'string' ? raw.fchVtoPago : undefined,
  }

  try {
    const { cae, numero, id } = await emitirYGuardar(supabase, user.id, input)
    return NextResponse.json({ ok: true, cae: cae.cae, caeVto: cae.caeVto, numero, id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AFIP rechazó el comprobante' }, { status: 400 })
  }
}
