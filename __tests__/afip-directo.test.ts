// Tests del cliente AFIP directo (sin terceros): WSAA + padrón/constancia.
import { describe, it, expect, vi } from 'vitest'
import forge from 'node-forge'
import {
  fechaAR, construirTRA, firmarTRA, extraerTag, loginWSAA, esNoAutorizado, WsaaError,
} from '@/lib/afip/wsaa'
import {
  parseConstancia, construirSoapConstancia, consultarConstancia, PadronError,
} from '@/lib/afip/padron'

// Keypair + cert self-signed para firmar (una vez).
const keys = forge.pki.rsa.generateKeyPair(2048)
const KEY_PEM = forge.pki.privateKeyToPem(keys.privateKey)
const CERT_PEM = (() => {
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(0)
  cert.validity.notAfter = new Date(4102444800000)
  const attrs = [{ shortName: 'CN', value: 'prod1' }]
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return forge.pki.certificateToPem(cert)
})()

const NOW = 1_753_000_000_000 // epoch fijo para determinismo

function jsonText(text: string): Response {
  return { ok: true, status: 200, text: async () => text } as unknown as Response
}

describe('fechaAR', () => {
  it('formatea en ISO con offset -03:00', () => {
    expect(fechaAR(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/)
  })
})

describe('construirTRA', () => {
  it('incluye el servicio y los tres campos del header', () => {
    const tra = construirTRA('ws_sr_constancia_inscripcion', NOW)
    expect(tra).toContain('<service>ws_sr_constancia_inscripcion</service>')
    expect(tra).toContain('<uniqueId>')
    expect(tra).toContain('<generationTime>')
    expect(tra).toContain('<expirationTime>')
  })
})

describe('firmarTRA', () => {
  it('produce un CMS/PKCS7 SignedData base64 con el certificado', () => {
    const b64 = firmarTRA(construirTRA('ws_sr_padron_a13', NOW), CERT_PEM, KEY_PEM, NOW)
    expect(b64.length).toBeGreaterThan(100)
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(b64)))
    // es signedData, con un firmante y el cert incluido
    expect((p7 as { type: string }).type).toBe(forge.pki.oids.signedData)
    expect((p7 as { certificates: unknown[] }).certificates.length).toBe(1)
  })
})

describe('loginWSAA', () => {
  const okBody = `<soapenv:Envelope><soapenv:Body><loginCmsResponse><loginCmsReturn>&lt;loginTicketResponse&gt;&lt;header&gt;&lt;expirationTime&gt;2026-07-22T21:00:00.000-03:00&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;TOKEN_ABC&lt;/token&gt;&lt;sign&gt;SIGN_XYZ&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`

  it('devuelve el TA (token+sign+expira)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonText(okBody))
    const ta = await loginWSAA({ service: 'ws_sr_constancia_inscripcion', certPem: CERT_PEM, keyPem: KEY_PEM, now: NOW, fetchImpl })
    expect(ta.token).toBe('TOKEN_ABC')
    expect(ta.sign).toBe('SIGN_XYZ')
    expect(ta.expira).toBe('2026-07-22T21:00:00.000-03:00')
    // pegó al endpoint de producción
    expect(fetchImpl.mock.calls[0][0]).toContain('wsaa.afip.gov.ar')
  })

  it('usa homologación cuando se pide', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonText(okBody))
    await loginWSAA({ service: 'x', certPem: CERT_PEM, keyPem: KEY_PEM, now: NOW, ambiente: 'homologacion', fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toContain('wsaahomo.afip.gov.ar')
  })

  it('tira WsaaError con el faultstring', async () => {
    const fault = `<soapenv:Envelope><soapenv:Body><soapenv:Fault><faultstring>Computador no autorizado a acceder al servicio</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`
    const fetchImpl = vi.fn().mockResolvedValue(jsonText(fault))
    await expect(loginWSAA({ service: 'ws_sr_padron_a10', certPem: CERT_PEM, keyPem: KEY_PEM, now: NOW, fetchImpl }))
      .rejects.toThrow(/no autorizado/i)
  })
})

describe('esNoAutorizado', () => {
  it('detecta el mensaje de servicio no habilitado', () => {
    expect(esNoAutorizado('Computador no autorizado a acceder al servicio')).toBe(true)
    expect(esNoAutorizado('otra cosa')).toBe(false)
    expect(esNoAutorizado(null)).toBe(false)
  })
})

// Fixture recortado de la respuesta real de getPersona_v2 (constancia).
const CONSTANCIA_XML = `<soap:Envelope><soap:Body><ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn><datosGenerales><apellido>BESSAN NOFAL</apellido><idPersona>20302960497</idPersona></datosGenerales><datosMonotributo><actividad><descripcionActividad>SERVICIOS DE CONSULTORES EN INFORMÁTICA</descripcionActividad><idActividad>620100</idActividad></actividad><actividadMonotributista><descripcionActividad>SERVICIOS DE CONSULTORES EN INFORMÁTICA</descripcionActividad><idActividad>620100</idActividad></actividadMonotributista><categoriaMonotributo><descripcionCategoria>H LOCACIONES DE SERVICIOS</descripcionCategoria><idCategoria>42</idCategoria><idImpuesto>20</idImpuesto><periodo>202602</periodo></categoriaMonotributo><impuesto><descripcionImpuesto>MONOTRIBUTO</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto><idImpuesto>20</idImpuesto><periodo>202308</periodo></impuesto></datosMonotributo></personaReturn></ns2:getPersona_v2Response></soap:Body></soap:Envelope>`

describe('parseConstancia', () => {
  it('extrae la categoría de monotributo', () => {
    const d = parseConstancia(CONSTANCIA_XML)
    expect(d.categoria).toBe('H')
    expect(d.descripcionCategoria).toBe('H LOCACIONES DE SERVICIOS')
    expect(d.periodo).toBe('202602')
    expect(d.activo).toBe(true)
    expect(d.actividad).toMatch(/CONSULTORES/)
  })

  it('sin datos de monotributo → categoría null, inactivo', () => {
    const d = parseConstancia('<personaReturn><datosGenerales/></personaReturn>')
    expect(d.categoria).toBeNull()
    expect(d.activo).toBe(false)
  })
})

describe('construirSoapConstancia', () => {
  it('mete token, sign, cuit y getPersona_v2', () => {
    const soap = construirSoapConstancia({ token: 'T', sign: 'S', expira: '' }, '20302960497')
    expect(soap).toContain('getPersona_v2')
    expect(soap).toContain('<token>T</token>')
    expect(soap).toContain('<sign>S</sign>')
    expect(soap).toContain('<idPersona>20302960497</idPersona>')
  })
})

describe('consultarConstancia', () => {
  it('devuelve los datos parseados', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonText(CONSTANCIA_XML))
    const d = await consultarConstancia({ ta: { token: 'T', sign: 'S', expira: '' }, cuit: '20302960497', fetchImpl })
    expect(d.categoria).toBe('H')
  })

  it('tira PadronError con el faultstring', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonText('<soap:Fault><faultstring>Token invalido</faultstring></soap:Fault>'))
    await expect(consultarConstancia({ ta: { token: 'T', sign: 'S', expira: '' }, cuit: '20302960497', fetchImpl }))
      .rejects.toThrow(/Token invalido/)
  })
})
