// ─── POST /api/monotributo/importar-comprobantes ─────────────────────────────
//
// Importa el CSV de "Mis Comprobantes" (ARCA → Comprobantes emitidos → CSV).
// Es el único camino para traer lo emitido desde "Comprobantes en línea": wsfe
// no los ve (ver lib/afip/mis-comprobantes.ts).
//
// Body: { csv: string, dryRun?: boolean }
//   dryRun → devuelve el preview sin escribir nada.
//   si no  → inserta las nuevas. Idempotente: dedup por CAE y por
//            punto de venta + número, así reimportar el mismo archivo no duplica.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { parseMisComprobantes, type FilaComprobante } from '@/lib/afip/mis-comprobantes'

export const maxDuration = 60

const CSV_MAX = 5_000_000 // 5 MB — un export de años pesa unos pocos cientos de KB

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>

  const csv = typeof raw.csv === 'string' ? raw.csv : ''
  if (!csv.trim()) return NextResponse.json({ error: 'Mandá el contenido del CSV' }, { status: 400 })
  if (csv.length > CSV_MAX) return NextResponse.json({ error: 'El archivo es demasiado grande' }, { status: 400 })
  const dryRun = raw.dryRun === true

  const { filas, descartadas, columnas } = parseMisComprobantes(csv)
  if (filas.length === 0) {
    return NextResponse.json({
      error: descartadas[0]?.motivo ?? 'No encontramos comprobantes en el archivo',
      columnas,
    }, { status: 400 })
  }

  // ── Dedup contra lo que ya está cargado ───────────────────────────────────
  // Por CAE (lo más confiable) y por número de comprobante (cubre las cargadas
  // a mano o por PDF, que también guardan el número).
  const { data: existentes, error: errExist } = await supabase
    .from('facturas_emitidas')
    .select('cae, numero_comprobante')
    .eq('user_id', user.id)
  if (errExist) return NextResponse.json({ error: errExist.message }, { status: 400 })

  const caes    = new Set((existentes ?? []).map(f => f.cae).filter(Boolean) as string[])
  const numeros = new Set((existentes ?? []).map(f => f.numero_comprobante).filter(Boolean) as string[])

  const nuevas: FilaComprobante[] = []
  const yaEstaban: FilaComprobante[] = []
  // Dedup también DENTRO del archivo (un export repetido en la misma tanda).
  const vistos = new Set<string>()
  for (const f of filas) {
    const clave = f.cae ?? f.numeroComprobante
    if ((f.cae && caes.has(f.cae)) || numeros.has(f.numeroComprobante) || vistos.has(clave)) {
      yaEstaban.push(f)
      continue
    }
    vistos.add(clave)
    nuevas.push(f)
  }

  const resumen = {
    encontradas: filas.length,
    nuevas:      nuevas.length,
    yaEstaban:   yaEstaban.length,
    notasCredito: filas.filter(f => f.esNotaCredito).length,
    totalNuevas: Number(nuevas.reduce((s, f) => s + f.total, 0).toFixed(2)),
    desde:       filas.reduce((min, f) => (f.fecha < min ? f.fecha : min), filas[0].fecha),
    hasta:       filas.reduce((max, f) => (f.fecha > max ? f.fecha : max), filas[0].fecha),
    descartadas: descartadas.length,
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      resumen,
      // Preview acotado: alcanza para que el usuario vea que leímos bien.
      preview: nuevas.slice(0, 25).map(f => ({
        fecha: f.fecha, cliente: f.cliente, monto: f.total,
        numero: f.numeroComprobante, tipo: f.tipoLabel, esNotaCredito: f.esNotaCredito,
      })),
    })
  }

  if (nuevas.length === 0) {
    return NextResponse.json({ ok: true, importadas: 0, resumen })
  }

  const rows = nuevas.map(f => ({
    user_id:            user.id,
    fecha:              f.fecha,
    cliente:            f.cliente,
    concepto:           null,
    monto:              f.total,
    numero_comprobante: f.numeroComprobante,
    tipo_comprobante:   f.esNotaCredito ? 'NC' : 'C',
    cae:                f.cae,
    punto_venta:        f.puntoVenta,
    cliente_cuit:       f.clienteDoc,
  }))

  const { error } = await supabase.from('facturas_emitidas').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, importadas: rows.length, resumen })
}
