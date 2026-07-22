// Tests de lib/afip/factura-pdf.ts — QR de AFIP + HTML de la Factura C.
import { describe, it, expect } from 'vitest'
import { urlQrAfip, construirHtmlFactura, type FacturaPdfData } from '@/lib/afip/factura-pdf'

const D: FacturaPdfData = {
  emisor: { nombre: 'BESSAN NOFAL LUCIANO FEDERICO', cuit: '20302960497', domicilio: 'Corrientes 3315', inicioActividades: '01/08/2023' },
  receptor: { nombre: 'NOMINA SUELDOS NET S.A', docTipo: 80, docNro: '30717901262', condIva: 'IVA Responsable Inscripto' },
  ptoVta: 1, numero: 106, fecha: '2026-06-30', concepto: 2,
  periodoDesde: '2026-06-01', periodoHasta: '2026-06-30', vtoPago: '2026-07-06',
  items: [{ descripcion: 'Honorario profesionales', cantidad: 1, precio: 2112000 }, { descripcion: 'Honorario proyecto', cantidad: 1, precio: 1248000 }],
  total: 3360000, cae: '86272281655236', caeVto: '2026-07-10',
}

describe('urlQrAfip', () => {
  it('arma la URL de AFIP con el payload base64 (RG 4291)', () => {
    const url = urlQrAfip(D)
    expect(url).toContain('https://www.afip.gob.ar/fe/qr/?p=')
    const payload = JSON.parse(Buffer.from(url.split('p=')[1], 'base64').toString('utf8'))
    expect(payload).toMatchObject({
      ver: 1, cuit: 20302960497, ptoVta: 1, tipoCmp: 11, nroCmp: 106,
      importe: 3360000, moneda: 'PES', tipoDocRec: 80, nroDocRec: 30717901262, tipoCodAut: 'E', codAut: 86272281655236,
    })
  })
})

describe('construirHtmlFactura', () => {
  it('incluye CAE, ítems, total y el QR embebido', async () => {
    const html = await construirHtmlFactura(D)
    expect(html).toContain('86272281655236') // CAE
    expect(html).toContain('Honorario profesionales') // ítem
    expect(html).toContain('NOMINA SUELDOS NET S.A') // receptor
    expect(html).toContain('data:image/png;base64') // QR embebido
    expect(html).toMatch(/3\.360\.000/) // total formateado AR
  })
})
