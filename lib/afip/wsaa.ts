// ─── lib/afip/wsaa.ts ────────────────────────────────────────────────────────
//
// Cliente WSAA (Web Service de Autenticación y Autorización) de AFIP, PROPIO —
// sin servicios de terceros. Le pegamos directo a AFIP con el certificado del
// usuario:
//   1) armamos un TRA (Ticket de Requerimiento de Acceso) para el servicio,
//   2) lo firmamos como CMS/PKCS#7 con el cert + clave privada (node-forge),
//   3) POST a LoginCms → AFIP devuelve un TA (token + sign) válido ~12h.
//
// El TA se usa después para llamar a los web services (padrón, wsfe, etc.).
// node-forge es solo cripto local (equivalente a OpenSSL); no hay llamadas a
// terceros.

import forge from 'node-forge'

export type Ambiente = 'produccion' | 'homologacion'

/** Ticket de Acceso devuelto por WSAA. `expira` en ISO8601. */
export type TA = { token: string; sign: string; expira: string }

const WSAA_URL: Record<Ambiente, string> = {
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
}

export class WsaaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WsaaError'
  }
}

/** Formatea un epoch (ms) en ISO8601 con offset de Argentina (-03:00). */
export function fechaAR(ms: number): string {
  const t = new Date(ms - 3 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}-03:00`
}

/** Arma el TRA (XML) para un servicio. Ventana de validez de 20 min alrededor de `now`. */
export function construirTRA(service: string, now: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
<header><uniqueId>${Math.floor(now / 1000)}</uniqueId><generationTime>${fechaAR(now - 600000)}</generationTime><expirationTime>${fechaAR(now + 600000)}</expirationTime></header>
<service>${service}</service>
</loginTicketRequest>`
}

/**
 * Firma el TRA como CMS/PKCS#7 SignedData y lo devuelve en base64 (lo que espera
 * LoginCms). Incluye el certificado y los atributos autenticados estándar
 * (contentType, messageDigest, signingTime), igual que `openssl cms -sign`.
 */
export function firmarTRA(traXml: string, certPem: string, keyPem: string, now: number): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const key = forge.pki.privateKeyFromPem(keyPem)
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(traXml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      // node-forge acepta un Date para signingTime en runtime (los tipos dicen string).
      { type: forge.pki.oids.signingTime, value: new Date(now) as unknown as string },
    ],
  })
  p7.sign()
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Extrae el contenido de un tag (sin namespace). */
export function extraerTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].trim() : null
}

/**
 * Login contra WSAA para un servicio. Devuelve el TA (token+sign+expira).
 * Tira WsaaError con el faultstring de AFIP si algo falla (ej. "Computador no
 * autorizado a acceder al servicio" cuando el cert no tiene el WS habilitado).
 */
export async function loginWSAA(opts: {
  service: string
  certPem: string
  keyPem: string
  ambiente?: Ambiente
  now?: number
  fetchImpl?: typeof fetch
}): Promise<TA> {
  const now = opts.now ?? Date.now()
  const ambiente = opts.ambiente ?? 'produccion'
  const doFetch = opts.fetchImpl ?? fetch

  const cms = firmarTRA(construirTRA(opts.service, now), opts.certPem, opts.keyPem, now)
  const soap = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`

  const res = await doFetch(WSAA_URL[ambiente], {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: soap,
  })
  const dec = unescapeXml(await res.text())

  const token = extraerTag(dec, 'token')
  const sign = extraerTag(dec, 'sign')
  if (!token || !sign) {
    throw new WsaaError(extraerTag(dec, 'faultstring') || `WSAA respondió ${res.status}`)
  }
  return {
    token,
    sign,
    expira: extraerTag(dec, 'expirationTime') ?? new Date(now + 11 * 3600 * 1000).toISOString(),
  }
}

/** ¿El error de WSAA es porque el cert no tiene el servicio habilitado? */
export function esNoAutorizado(msg: string | null | undefined): boolean {
  return !!msg && /no autorizado/i.test(msg)
}
