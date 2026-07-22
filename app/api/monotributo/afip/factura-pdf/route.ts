// ─── GET /api/monotributo/afip/factura-pdf?id=… ──────────────────────────────
// Genera el PDF de una Factura C emitida (con ítems, CAE y QR de AFIP).

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import { cargarCert, obtenerTA } from '@/lib/afip/ta'
import { SERVICIO_CONSTANCIA, consultarEmisor } from '@/lib/afip/padron'
import { construirHtmlFactura, type ItemPdf } from '@/lib/afip/factura-pdf'
import { htmlToPdf } from '@/lib/reporte-mes/pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

const COND_IVA_LABEL: Record<number, string> = {
  1: 'IVA Responsable Inscripto', 6: 'Responsable Monotributo', 4: 'IVA Sujeto Exento', 5: 'Consumidor Final',
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const { data: f } = await supabase.from('facturas_emitidas').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!f || !f.cae) return NextResponse.json({ error: 'Factura no encontrada o sin CAE' }, { status: 404 })

  try {
    const cert = await cargarCert(supabase, user.id)
    const ta = await obtenerTA(supabase, user.id, SERVICIO_CONSTANCIA, cert)
    const emisor = await consultarEmisor({ ta, cuit: cert.cuit, ambiente: cert.ambiente })

    const [pvStr, nroStr] = (f.numero_comprobante ?? '00001-00000001').split('-')
    const conceptoNum = f.concepto === 'productos' ? 1 : f.concepto === 'productos y servicios' ? 3 : 2
    const items: ItemPdf[] = Array.isArray(f.items) && f.items.length
      ? (f.items as unknown as ItemPdf[]).map(it => ({ descripcion: String(it.descripcion ?? ''), cantidad: Number(it.cantidad) || 1, precio: Number(it.precio) || 0 }))
      : [{ descripcion: f.concepto ?? 'Servicios', cantidad: 1, precio: Number(f.monto) }]

    const html = await construirHtmlFactura({
      emisor: { nombre: emisor.nombre ?? '', cuit: cert.cuit, domicilio: emisor.domicilio ?? '', inicioActividades: emisor.inicioActividades ?? '' },
      receptor: { nombre: f.cliente, docTipo: f.cliente_cuit ? 80 : 99, docNro: f.cliente_cuit ?? '0', condIva: COND_IVA_LABEL[f.iva_receptor ?? 5] ?? 'Consumidor Final' },
      ptoVta: Number(pvStr) || 1,
      numero: Number(nroStr) || 0,
      fecha: f.fecha,
      concepto: conceptoNum,
      periodoDesde: f.periodo_desde,
      periodoHasta: f.periodo_hasta,
      vtoPago: f.vto_pago,
      items,
      total: Number(f.monto),
      cae: f.cae,
      caeVto: f.cae_vencimiento ?? '',
    })

    const pdf = await htmlToPdf(html)
    return new NextResponse(new Blob([pdf as BlobPart], { type: 'application/pdf' }), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="factura-${(f.numero_comprobante ?? id).replace(/\W/g, '-')}.pdf"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo generar el PDF' }, { status: 400 })
  }
}
