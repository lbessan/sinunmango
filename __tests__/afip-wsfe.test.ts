// Tests de lib/afip/wsfe.ts — facturación electrónica (Factura C). Todo mockeado.
import { describe, it, expect, vi } from 'vitest'
import {
  extraerErrores, parsePuntosVenta, ultimoComprobante,
  construirFECAESolicitar, parseCaeResult, emitirFacturaC, WsfeError,
  type FacturaC,
} from '@/lib/afip/wsfe'
import type { TA } from '@/lib/afip/wsaa'

const TA: TA = { token: 'TOK', sign: 'SGN', expira: '' }
const CUIT = '20302960497'
const factura = (over: Partial<FacturaC> = {}): FacturaC => ({
  ptoVta: 3, concepto: 2, docTipo: 99, docNro: 0, importe: 15000.5, fecha: '20260722', ...over,
})

describe('extraerErrores', () => {
  it('junta los <Err> en texto', () => {
    expect(extraerErrores('<Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors>')).toBe('[602] Sin Resultados')
  })
  it('sin errores → null', () => {
    expect(extraerErrores('<x>ok</x>')).toBeNull()
  })
})

describe('parsePuntosVenta', () => {
  it('lista los puntos de venta', () => {
    const xml = '<ResultGet><PtoVenta><Nro>3</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado></PtoVenta></ResultGet>'
    expect(parsePuntosVenta(xml)).toEqual([{ nro: 3, tipo: 'CAE', bloqueado: false }])
  })
})

describe('ultimoComprobante', () => {
  it('devuelve el CbteNro', async () => {
    const post = vi.fn().mockResolvedValue('<FECompUltimoAutorizadoResult><CbteNro>7</CbteNro></FECompUltimoAutorizadoResult>')
    const n = await ultimoComprobante({ ta: TA, cuit: CUIT, ptoVta: 3, cbteTipo: 11, post })
    expect(n).toBe(7)
    // pegó al método correcto
    expect(post.mock.calls[0][1]).toBe('FECompUltimoAutorizado')
  })
  it('tira si el punto de venta no está habilitado', async () => {
    const post = vi.fn().mockResolvedValue('<Errors><Err><Code>11002</Code><Msg>El punto de venta no se encuentra habilitado</Msg></Err></Errors>')
    await expect(ultimoComprobante({ ta: TA, cuit: CUIT, ptoVta: 1, cbteTipo: 11, post })).rejects.toThrow(/11002/)
  })
})

describe('construirFECAESolicitar', () => {
  it('Factura C servicios: neto=total, sin IVA, con fechas de servicio', () => {
    const xml = construirFECAESolicitar(TA, CUIT, factura({ concepto: 2 }), 8)
    expect(xml).toContain('<ar:CbteTipo>11</ar:CbteTipo>')
    expect(xml).toContain('<ar:CbteDesde>8</ar:CbteDesde><ar:CbteHasta>8</ar:CbteHasta>')
    expect(xml).toContain('<ar:ImpTotal>15000.5</ar:ImpTotal>')
    expect(xml).toContain('<ar:ImpNeto>15000.5</ar:ImpNeto>')
    expect(xml).toContain('<ar:ImpIVA>0</ar:ImpIVA>')
    expect(xml).toContain('<ar:FchServDesde>20260722</ar:FchServDesde>')
    expect(xml).toContain('<ar:FchVtoPago>20260722</ar:FchVtoPago>')
  })
  it('Factura C productos: sin fechas de servicio', () => {
    const xml = construirFECAESolicitar(TA, CUIT, factura({ concepto: 1 }), 8)
    expect(xml).not.toContain('FchServDesde')
  })
})

describe('parseCaeResult', () => {
  const okXml = '<FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CbteDesde>8</CbteDesde><CbteHasta>8</CbteHasta><CAE>71234567890123</CAE><CAEFchVto>20260801</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult>'

  it('aprobado → devuelve CAE + vto + nro', () => {
    const r = parseCaeResult(okXml)
    expect(r).toEqual({ cae: '71234567890123', caeVto: '20260801', cbteNro: 8, resultado: 'A' })
  })
  it('rechazado → tira con la observación', () => {
    const rej = '<FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10016</Code><Msg>Fecha comprobante inválida</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult>'
    expect(() => parseCaeResult(rej)).toThrow(/Fecha comprobante inválida/)
  })
})

describe('emitirFacturaC', () => {
  it('pide el último, emite el siguiente y devuelve el CAE', async () => {
    const post = vi.fn((_url: string, action: string) => {
      if (action === 'FECompUltimoAutorizado') return Promise.resolve('<FECompUltimoAutorizadoResult><CbteNro>7</CbteNro></FECompUltimoAutorizadoResult>')
      return Promise.resolve('<FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CbteDesde>8</CbteDesde><CbteHasta>8</CbteHasta><CAE>71234567890123</CAE><CAEFchVto>20260801</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult>')
    })
    const r = await emitirFacturaC({ ta: TA, cuit: CUIT, factura: factura(), post })
    expect(r.cae).toBe('71234567890123')
    expect(r.cbteNro).toBe(8)
    // el segundo POST (FECAESolicitar) usó el número 8
    const solicitar = post.mock.calls.find(c => c[1] === 'FECAESolicitar')!
    expect(solicitar[2]).toContain('<ar:CbteDesde>8</ar:CbteDesde>')
  })

  it('propaga el rechazo de AFIP', async () => {
    const post = vi.fn((_url: string, action: string) =>
      action === 'FECompUltimoAutorizado'
        ? Promise.resolve('<FECompUltimoAutorizadoResult><CbteNro>0</CbteNro></FECompUltimoAutorizadoResult>')
        : Promise.resolve('<FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10016</Code><Msg>Dato inválido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult>'))
    await expect(emitirFacturaC({ ta: TA, cuit: CUIT, factura: factura(), post })).rejects.toBeInstanceOf(WsfeError)
  })
})
