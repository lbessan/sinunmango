// ─── lib/afip/factura-pdf.ts ─────────────────────────────────────────────────
//
// Genera el HTML de una Factura C (para renderizar a PDF con puppeteer) con el
// detalle de ítems, CAE y el QR de AFIP (RG 4291).

import QRCode from 'qrcode'

export type ItemPdf = { descripcion: string; cantidad: number; precio: number }

export type FacturaPdfData = {
  emisor: { nombre: string; cuit: string; domicilio: string; inicioActividades: string }
  receptor: { nombre: string; docTipo: number; docNro: string; condIva: string }
  ptoVta: number
  numero: number
  fecha: string // YYYY-MM-DD
  concepto: number // 1 productos, 2 servicios, 3 ambos
  periodoDesde?: string | null
  periodoHasta?: string | null
  vtoPago?: string | null
  items: ItemPdf[]
  total: number
  cae: string
  caeVto: string // YYYY-MM-DD
}

const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmt = (n: number) => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fdate = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
const DOC_LABEL: Record<number, string> = { 80: 'CUIT', 96: 'DNI', 86: 'CUIL', 99: 'Consumidor Final' }

/** URL del QR de AFIP con el payload base64 (RG 4291). */
export function urlQrAfip(d: FacturaPdfData): string {
  const payload = {
    ver: 1, fecha: d.fecha, cuit: Number(d.emisor.cuit), ptoVta: d.ptoVta, tipoCmp: 11,
    nroCmp: d.numero, importe: d.total, moneda: 'PES', ctz: 1,
    tipoDocRec: d.receptor.docTipo, nroDocRec: Number(d.receptor.docNro) || 0,
    tipoCodAut: 'E', codAut: Number(d.cae),
  }
  return 'https://www.afip.gob.ar/fe/qr/?p=' + Buffer.from(JSON.stringify(payload)).toString('base64')
}

/** Arma el HTML de la Factura C, con el QR embebido como data URI. */
export async function construirHtmlFactura(d: FacturaPdfData): Promise<string> {
  const qr = await QRCode.toDataURL(urlQrAfip(d), { margin: 1, width: 120 })
  const conceptoTxt = d.concepto === 1 ? 'Productos' : d.concepto === 2 ? 'Servicios' : 'Productos y Servicios'
  const filas = d.items.map(it => `
    <tr>
      <td>${esc(it.descripcion)}</td>
      <td class="c">${it.cantidad.toLocaleString('es-AR')}</td>
      <td class="c">unidades</td>
      <td class="r">${fmt(it.precio)}</td>
      <td class="r">${fmt(it.cantidad * it.precio)}</td>
    </tr>`).join('')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Arial,sans-serif}
    body{margin:0;padding:22px;color:#1e293b;font-size:11px}
    .box{border:1px solid #334155;border-radius:2px}
    .top{display:flex;align-items:stretch;position:relative}
    .top .l,.top .rgt{flex:1;padding:14px 16px}
    .cbox{width:56px;text-align:center;border-left:1px solid #334155;border-right:1px solid #334155;display:flex;flex-direction:column;justify-content:center}
    .cbox .letra{font-size:34px;font-weight:800;line-height:1}
    .cbox .cod{font-size:8px}
    h1{font-size:20px;margin:0 0 2px}
    .muted{color:#475569}
    .row{display:flex;gap:6px;margin:1px 0}
    .row b{min-width:auto}
    hr{border:0;border-top:1px solid #cbd5e1;margin:10px 0}
    .grid2{display:flex;gap:18px}
    .grid2>div{flex:1}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:10px}
    th{background:#e2e8f0;text-align:left;padding:5px 6px;border-bottom:1px solid #94a3b8}
    td{padding:5px 6px;border-bottom:1px solid #e2e8f0}
    td.c,th.c{text-align:center}
    td.r,th.r{text-align:right}
    .tot{text-align:right;margin-top:10px;font-size:13px}
    .tot b{font-size:16px}
    .cae{display:flex;align-items:center;gap:14px;margin-top:16px;padding-top:10px;border-top:1px solid #334155}
    .cae img{width:96px;height:96px}
    .cae .d{font-size:11px}
  </style></head><body>
    <div class="box">
      <div class="top">
        <div class="l">
          <h1>${esc(d.emisor.nombre)}</h1>
          <div class="row muted"><b>Razón Social:</b> ${esc(d.emisor.nombre)}</div>
          <div class="row muted"><b>Domicilio:</b> ${esc(d.emisor.domicilio)}</div>
          <div class="row muted"><b>Condición frente al IVA:</b> Responsable Monotributo</div>
        </div>
        <div class="cbox"><div class="letra">C</div><div class="cod">COD. 011</div></div>
        <div class="rgt">
          <h1>FACTURA</h1>
          <div class="row"><b>Punto de Venta:</b> ${String(d.ptoVta).padStart(5, '0')} &nbsp; <b>Comp. Nro:</b> ${String(d.numero).padStart(8, '0')}</div>
          <div class="row"><b>Fecha de Emisión:</b> ${fdate(d.fecha)}</div>
          <div class="row"><b>CUIT:</b> ${esc(d.emisor.cuit)}</div>
          <div class="row"><b>Ingresos Brutos:</b> ${esc(d.emisor.cuit)}</div>
          <div class="row"><b>Inicio de Actividades:</b> ${esc(d.emisor.inicioActividades)}</div>
        </div>
      </div>
      <div style="padding:12px 16px">
        <div class="grid2">
          <div>
            <div class="row"><b>Período Facturado Desde:</b> ${fdate(d.periodoDesde)} &nbsp; <b>Hasta:</b> ${fdate(d.periodoHasta)}</div>
            <div class="row"><b>Fecha Vto. para el pago:</b> ${fdate(d.vtoPago)}</div>
          </div>
        </div>
        <hr>
        <div class="row"><b>CUIT:</b> ${esc(d.receptor.docNro)} &nbsp; <b>${DOC_LABEL[d.receptor.docTipo] ?? 'Doc'}:</b></div>
        <div class="row"><b>Apellido y Nombre / Razón Social:</b> ${esc(d.receptor.nombre)}</div>
        <div class="row"><b>Condición frente al IVA:</b> ${esc(d.receptor.condIva)} &nbsp; <b>Concepto:</b> ${conceptoTxt}</div>

        <table>
          <thead><tr><th>Producto / Servicio</th><th class="c">Cantidad</th><th class="c">U. Medida</th><th class="r">Precio Unit.</th><th class="r">Subtotal</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>

        <div class="tot">Subtotal: ${fmt(d.total)} &nbsp;·&nbsp; Importe Total: <b>${fmt(d.total)}</b></div>

        <div class="cae">
          <img src="${qr}" alt="QR AFIP">
          <div class="d">
            <div><b>CAE N°:</b> ${esc(d.cae)}</div>
            <div><b>Fecha de Vto. de CAE:</b> ${fdate(d.caeVto)}</div>
            <div class="muted" style="margin-top:4px">Comprobante Autorizado</div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`
}
