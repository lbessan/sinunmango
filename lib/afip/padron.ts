// ─── lib/afip/padron.ts ──────────────────────────────────────────────────────
//
// Lectura de la categoría de monotributo directo de AFIP (sin terceros), con el
// certificado del usuario. Usa el servicio de Constancia de Inscripción
// (ws_sr_constancia_inscripcion), que devuelve `datosMonotributo` con la
// categoría, actividades e impuestos.
//
// Nota: el padrón NO trae la facturación acumulada (eso no vive acá; se obtiene
// por wsfe leyendo los comprobantes, o se calcula al emitir).

import type { TA, Ambiente } from './wsaa'
import { extraerTag } from './wsaa'

/** Servicio WSAA que hay que pedir para consultar la constancia. */
export const SERVICIO_CONSTANCIA = 'ws_sr_constancia_inscripcion'

// La constancia se sirve por el endpoint de padrón A5 (getPersona_v2).
const PADRON_URL: Record<Ambiente, string> = {
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
}

export type DatosMonotributo = {
  categoria: string | null            // 'H'
  descripcionCategoria: string | null // 'H LOCACIONES DE SERVICIOS'
  periodo: string | null              // '202602'
  actividad: string | null            // descripción de la actividad monotributista
  activo: boolean                     // impuesto MONOTRIBUTO en estado AC
}

export class PadronError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PadronError'
  }
}

/** Parsea la respuesta de getPersona_v2 (constancia) → datos de monotributo. */
export function parseConstancia(xml: string): DatosMonotributo {
  const mono = xml.match(/<datosMonotributo>([\s\S]*?)<\/datosMonotributo>/i)?.[1] ?? ''
  const catBloque = mono.match(/<categoriaMonotributo>([\s\S]*?)<\/categoriaMonotributo>/i)?.[1] ?? ''
  const descripcion = extraerTag(catBloque, 'descripcionCategoria')
  // La categoría es la primera "palabra" de la descripción: "H LOCACIONES…" → "H".
  const categoria = descripcion ? descripcion.trim().split(/\s+/)[0] : null

  const impuesto = mono.match(/<impuesto>([\s\S]*?)<\/impuesto>/i)?.[1] ?? ''
  const actividadMono = mono.match(/<actividadMonotributista>([\s\S]*?)<\/actividadMonotributista>/i)?.[1] ?? ''

  return {
    categoria,
    descripcionCategoria: descripcion,
    periodo: extraerTag(catBloque, 'periodo'),
    actividad: extraerTag(actividadMono, 'descripcionActividad'),
    activo: extraerTag(impuesto, 'estadoImpuesto') === 'AC',
  }
}

/** Arma el SOAP de getPersona_v2. `idPersona` = a quién se consulta (default: uno mismo). */
export function construirSoapConstancia(ta: TA, cuitRepresentada: string, idPersona: string = cuitRepresentada): string {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${ta.token}</token><sign>${ta.sign}</sign><cuitRepresentada>${cuitRepresentada}</cuitRepresentada><idPersona>${idPersona}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`
}

export type PersonaAfip = { nombre: string | null; tipoPersona: string | null }

/** Nombre/razón social desde datosGenerales (razonSocial para jurídicas, nombre+apellido para físicas). */
export function parseNombrePersona(xml: string): PersonaAfip {
  const dg = xml.match(/<datosGenerales>([\s\S]*?)<\/datosGenerales>/i)?.[1] ?? ''
  const razon = extraerTag(dg, 'razonSocial')
  const nombre = razon
    ? razon
    : ([extraerTag(dg, 'nombre'), extraerTag(dg, 'apellido')].filter(Boolean).join(' ').trim() || null)
  return { nombre, tipoPersona: extraerTag(dg, 'tipoPersona') }
}

/**
 * Consulta el nombre/razón social de CUALQUIER CUIT en el padrón (para la
 * libreta de clientes). El padrón es público: con el cert propio consultás a
 * terceros. Tira PadronError si falla.
 */
export async function consultarPersona(opts: {
  ta: TA
  cuitConsultante: string
  cuit: string
  ambiente?: Ambiente
  fetchImpl?: typeof fetch
}): Promise<PersonaAfip> {
  const ambiente = opts.ambiente ?? 'produccion'
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(PADRON_URL[ambiente], {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: construirSoapConstancia(opts.ta, opts.cuitConsultante, opts.cuit),
  })
  const text = await res.text()
  const fault = extraerTag(text, 'faultstring')
  if (fault) throw new PadronError(fault)
  return parseNombrePersona(text)
}

export type EmisorAfip = { nombre: string | null; domicilio: string | null; inicioActividades: string | null }

/** Datos del emisor (uno mismo) para el PDF: nombre, domicilio fiscal, inicio de actividades. */
export function parseEmisor(xml: string): EmisorAfip {
  const dg = xml.match(/<datosGenerales>([\s\S]*?)<\/datosGenerales>/i)?.[1] ?? ''
  const razon = extraerTag(dg, 'razonSocial')
  const nombre = razon || ([extraerTag(dg, 'nombre'), extraerTag(dg, 'apellido')].filter(Boolean).join(' ').trim() || null)
  const dom = dg.match(/<domicilioFiscal>([\s\S]*?)<\/domicilioFiscal>/i)?.[1] ?? ''
  const domicilio = [extraerTag(dom, 'direccion'), extraerTag(dom, 'localidad'), extraerTag(dom, 'descripcionProvincia')]
    .filter(Boolean).join(', ') || null
  const mono = xml.match(/<datosMonotributo>([\s\S]*?)<\/datosMonotributo>/i)?.[1] ?? ''
  const per = extraerTag(mono.match(/<actividadMonotributista>([\s\S]*?)<\/actividadMonotributista>/i)?.[1] ?? '', 'periodo')
  const inicioActividades = per && per.length === 6 ? `01/${per.slice(4, 6)}/${per.slice(0, 4)}` : null
  return { nombre, domicilio, inicioActividades }
}

export async function consultarEmisor(opts: { ta: TA; cuit: string; ambiente?: Ambiente; fetchImpl?: typeof fetch }): Promise<EmisorAfip> {
  const ambiente = opts.ambiente ?? 'produccion'
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(PADRON_URL[ambiente], {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: construirSoapConstancia(opts.ta, opts.cuit),
  })
  const text = await res.text()
  const fault = extraerTag(text, 'faultstring')
  if (fault) throw new PadronError(fault)
  return parseEmisor(text)
}

/** Consulta la constancia con un TA ya obtenido de WSAA. Tira PadronError si falla. */
export async function consultarConstancia(opts: {
  ta: TA
  cuit: string
  ambiente?: Ambiente
  fetchImpl?: typeof fetch
}): Promise<DatosMonotributo> {
  const ambiente = opts.ambiente ?? 'produccion'
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(PADRON_URL[ambiente], {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: construirSoapConstancia(opts.ta, opts.cuit),
  })
  const text = await res.text()
  const fault = extraerTag(text, 'faultstring')
  if (fault) throw new PadronError(fault)
  return parseConstancia(text)
}
