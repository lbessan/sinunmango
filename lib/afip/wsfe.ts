// ─── lib/afip/wsfe.ts ────────────────────────────────────────────────────────
//
// Cliente de Facturación Electrónica (wsfev1) de AFIP, PROPIO — sin terceros.
// Reusa el TA de WSAA (servicio 'wsfe') y emite/lee comprobantes.
//
// Para monotributo emitimos Factura C (CbteTipo 11): sin IVA discriminado, el
// total = neto. Concepto 1 productos, 2 servicios, 3 ambos.
//
// OJO TLS: el server de wsfe usa un DH key chico que el OpenSSL moderno rechaza
// ("dh key too small"). Bajamos el security level a 1 SOLO para ese host, con el
// módulo https de Node (funciona en Vercel).

import https from 'node:https'
import type { TA, Ambiente } from './wsaa'

export const SERVICIO_WSFE = 'wsfe'
const NS = 'http://ar.gov.afip.dif.FEV1/'

const WSFE_URL: Record<Ambiente, string> = {
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
}

export class WsfeError extends Error {
  codigo?: string
  constructor(message: string, codigo?: string) {
    super(message)
    this.name = 'WsfeError'
    this.codigo = codigo
  }
}

/** POST SOAP a wsfe con el fix de TLS (SECLEVEL=1 para el DH chico de AFIP). */
export type SoapPoster = (url: string, action: string, xml: string) => Promise<string>

const httpsPoster: SoapPoster = (url, action, xml) =>
  new Promise((resolve, reject) => {
    const u = new URL(url)
    const body = Buffer.from(xml, 'utf8')
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: NS + action, 'Content-Length': body.length },
        ciphers: 'DEFAULT:@SECLEVEL=1',
      },
      res => { let d = ''; res.setEncoding('utf8'); res.on('data', c => (d += c)); res.on('end', () => resolve(d)) },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })

const tag = (xml: string, t: string): string | null =>
  xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'i'))?.[1]?.trim() ?? null

/** Junta los <Err> de la respuesta en un string legible, o null si no hay. */
export function extraerErrores(xml: string): string | null {
  const errs = [...xml.matchAll(/<Code>(\d+)<\/Code>\s*<Msg>([\s\S]*?)<\/Msg>/g)]
  return errs.length ? errs.map(m => `[${m[1]}] ${m[2].replace(/\s+/g, ' ').trim()}`).join('; ') : null
}

function envelope(inner: string): string {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soapenv:Header/><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`
}
function authXml(ta: TA, cuit: string): string {
  return `<ar:Auth><ar:Token>${ta.token}</ar:Token><ar:Sign>${ta.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`
}

type BaseOpts = { ta: TA; cuit: string; ambiente?: Ambiente; post?: SoapPoster }
const call = (o: BaseOpts, action: string, inner: string) =>
  (o.post ?? httpsPoster)(WSFE_URL[o.ambiente ?? 'produccion'], action, envelope(inner))

// ── Puntos de venta ──────────────────────────────────────────────────────────
export type PuntoVenta = { nro: number; tipo: string | null; bloqueado: boolean }

export function parsePuntosVenta(xml: string): PuntoVenta[] {
  return [...xml.matchAll(/<PtoVenta>([\s\S]*?)<\/PtoVenta>/g)].map(m => ({
    nro: Number(tag(m[1], 'Nro') ?? 0),
    tipo: tag(m[1], 'EmisionTipo'),
    bloqueado: /^(s|si|true)$/i.test(tag(m[1], 'Bloqueado') ?? ''),
  }))
}

export async function listarPuntosVenta(o: BaseOpts): Promise<PuntoVenta[]> {
  return parsePuntosVenta(await call(o, 'FEParamGetPtosVenta', `<ar:FEParamGetPtosVenta>${authXml(o.ta, o.cuit)}</ar:FEParamGetPtosVenta>`))
}

// ── Último comprobante autorizado ────────────────────────────────────────────
export async function ultimoComprobante(o: BaseOpts & { ptoVta: number; cbteTipo: number }): Promise<number> {
  const xml = await call(o, 'FECompUltimoAutorizado',
    `<ar:FECompUltimoAutorizado>${authXml(o.ta, o.cuit)}<ar:PtoVta>${o.ptoVta}</ar:PtoVta><ar:CbteTipo>${o.cbteTipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`)
  const err = extraerErrores(xml)
  const nro = tag(xml, 'CbteNro')
  if (nro == null && err) throw new WsfeError(err)
  return Number(nro ?? 0)
}

// ── Emitir Factura C ─────────────────────────────────────────────────────────
const CBTE_FACTURA_C = 11

export type FacturaC = {
  ptoVta: number
  concepto: 1 | 2 | 3 // 1 productos, 2 servicios, 3 ambos
  docTipo: number // 80 CUIT, 96 DNI, 99 consumidor final
  docNro: number
  importe: number // total (Factura C: neto = total, sin IVA)
  fecha?: string // YYYYMMDD (default hoy)
  fchServDesde?: string
  fchServHasta?: string
  fchVtoPago?: string
}

export type CaeResult = { cae: string; caeVto: string; cbteNro: number; resultado: string }

function yyyymmdd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** Arma el FECAESolicitar para una Factura C. `cbteNro` = número a autorizar. */
export function construirFECAESolicitar(ta: TA, cuit: string, f: FacturaC, cbteNro: number): string {
  const fecha = f.fecha ?? yyyymmdd(new Date())
  const importe = Number(f.importe.toFixed(2))
  // Para servicios (2) o ambos (3), AFIP exige fechas de servicio + vto de pago.
  const servicio = f.concepto !== 1
    ? `<ar:FchServDesde>${f.fchServDesde ?? fecha}</ar:FchServDesde><ar:FchServHasta>${f.fchServHasta ?? fecha}</ar:FchServHasta><ar:FchVtoPago>${f.fchVtoPago ?? fecha}</ar:FchVtoPago>`
    : ''
  const det =
    `<ar:FECAEDetRequest>` +
    `<ar:Concepto>${f.concepto}</ar:Concepto><ar:DocTipo>${f.docTipo}</ar:DocTipo><ar:DocNro>${f.docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${cbteNro}</ar:CbteDesde><ar:CbteHasta>${cbteNro}</ar:CbteHasta><ar:CbteFch>${fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${importe}</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>${importe}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpIVA>0</ar:ImpIVA><ar:ImpTrib>0</ar:ImpTrib>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
    servicio +
    `</ar:FECAEDetRequest>`
  return (
    `<ar:FECAESolicitar>${authXml(ta, cuit)}<ar:FeCAEReq>` +
    `<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${f.ptoVta}</ar:PtoVta><ar:CbteTipo>${CBTE_FACTURA_C}</ar:CbteTipo></ar:FeCabReq>` +
    `<ar:FeDetReq>${det}</ar:FeDetReq>` +
    `</ar:FeCAEReq></ar:FECAESolicitar>`
  )
}

export function parseCaeResult(xml: string): CaeResult {
  const resultado = tag(xml, 'Resultado') ?? ''
  const cae = tag(xml, 'CAE') ?? ''
  // Rechazo (R) o sin CAE → juntar observaciones/errores.
  if (resultado !== 'A' || !cae) {
    const obs = [...xml.matchAll(/<Obs>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Obs>/g)].map(m => m[1].trim())
    const err = extraerErrores(xml)
    throw new WsfeError(
      [err, obs.join('; ')].filter(Boolean).join(' · ') || 'AFIP rechazó el comprobante',
    )
  }
  return { cae, caeVto: tag(xml, 'CAEFchVto') ?? '', cbteNro: Number(tag(xml, 'CbteHasta') ?? tag(xml, 'CbteDesde') ?? 0), resultado }
}

/**
 * Emite una Factura C: pide el último número autorizado, arma el siguiente y lo
 * solicita. Devuelve el CAE. Tira WsfeError si AFIP rechaza.
 */
export async function emitirFacturaC(o: BaseOpts & { factura: FacturaC }): Promise<CaeResult> {
  const ultimo = await ultimoComprobante({ ...o, ptoVta: o.factura.ptoVta, cbteTipo: CBTE_FACTURA_C })
  const cbteNro = ultimo + 1
  const xml = await call(o, 'FECAESolicitar', construirFECAESolicitar(o.ta, o.cuit, o.factura, cbteNro))
  return parseCaeResult(xml)
}
