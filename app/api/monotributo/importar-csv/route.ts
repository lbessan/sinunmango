// ─── POST /api/monotributo/importar-csv ──────────────────────────────────────
// Importa el CSV de "Mis Comprobantes → Emitidos" de AFIP: trae las facturas
// (incluidas las del facturador online) con CUIT y nombre del cliente, y
// completa la libreta. Recibe el texto del CSV en el body.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { parseMisComprobantesCSV, aplicarComprobantesCSV } from '@/lib/afip/mis-comprobantes'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const csv = String((body as Record<string, unknown>)?.csv ?? '')
  if (!csv.trim()) return NextResponse.json({ error: 'Falta el archivo CSV' }, { status: 400 })

  const rows = parseMisComprobantesCSV(csv)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No encontré facturas C en el archivo. ¿Es el CSV de Mis Comprobantes → Emitidos?' }, { status: 400 })
  }

  try {
    const r = await aplicarComprobantesCSV(supabase, user.id, rows)
    return NextResponse.json({ ok: true, ...r, leidas: rows.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo importar' }, { status: 400 })
  }
}
