// Tests para lib/afip-cert.ts — generación del CSR para AFIP.
import { describe, it, expect } from 'vitest'
import forge from 'node-forge'
import {
  generarKeypairYCsr,
  normalizarCuit,
  inspeccionarCertificado,
  csrDesdeKeyPem,
  certificadoMatcheaKey,
} from '@/lib/afip-cert'

// Arma un cert self-signed a partir de un keypair (para testear el match).
function selfSigned(privateKeyPem: string): string {
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e)
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(0)
  cert.validity.notAfter = new Date(4102444800000) // ~2100
  const attrs = [{ shortName: 'CN', value: 'test' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(key, forge.md.sha256.create())
  return forge.pki.certificateToPem(cert)
}

describe('normalizarCuit', () => {
  it('saca guiones y valida 11 dígitos', () => {
    expect(normalizarCuit('20-12345678-9')).toBe('20123456789')
  })
  it('tira si no son 11 dígitos', () => {
    expect(() => normalizarCuit('123')).toThrow(/CUIT/)
  })
})

describe('generarKeypairYCsr', () => {
  it('devuelve CSR y clave privada en PEM', () => {
    const { csrPem, privateKeyPem } = generarKeypairYCsr('20123456789', 'Lucho Bessan', 'sinunmango')
    expect(csrPem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----/)
    expect(privateKeyPem).toMatch(/-----BEGIN RSA PRIVATE KEY-----/)
  })

  it('el subject tiene C=AR, CN y serialNumber="CUIT <cuit>"', () => {
    const { csrPem } = generarKeypairYCsr('20123456789', 'Empresa Test', 'miAlias')
    const csr = forge.pki.certificationRequestFromPem(csrPem)
    const get = (sn: string) => csr.subject.getField({ shortName: sn })?.value
    expect(get('C')).toBe('AR')
    expect(get('CN')).toBe('miAlias')
    // serialNumber por OID
    const serial = csr.subject.attributes.find(a => a.type === '2.5.4.5')?.value
    expect(serial).toBe('CUIT 20123456789')
  })

  it('el CSR está firmado y verifica con su propia clave pública', () => {
    const { csrPem } = generarKeypairYCsr('27111111114', 'x', 'y')
    const csr = forge.pki.certificationRequestFromPem(csrPem)
    expect(csr.verify()).toBe(true)
  })
})

describe('csrDesdeKeyPem', () => {
  it('reconstruye un CSR válido y firmado desde una key existente', () => {
    const { privateKeyPem } = generarKeypairYCsr('20123456789', 'x', 'sinunmango')
    const csrPem = csrDesdeKeyPem(privateKeyPem, '20123456789', 'x', 'sinunmango')
    const csr = forge.pki.certificationRequestFromPem(csrPem)
    expect(csr.verify()).toBe(true)
    const serial = csr.subject.attributes.find(a => a.type === '2.5.4.5')?.value
    expect(serial).toBe('CUIT 20123456789')
  })

  it('el CSR reconstruido usa la misma clave pública que la key', () => {
    const { privateKeyPem } = generarKeypairYCsr('20123456789', 'x', 'y')
    const key = forge.pki.privateKeyFromPem(privateKeyPem)
    const csr = forge.pki.certificationRequestFromPem(csrDesdeKeyPem(privateKeyPem, '20123456789', 'x', 'y'))
    expect((csr.publicKey as forge.pki.rsa.PublicKey).n.toString(16)).toBe(key.n.toString(16))
  })
})

describe('certificadoMatcheaKey', () => {
  it('true si el cert corresponde a la key', () => {
    const { privateKeyPem } = generarKeypairYCsr('20123456789', 'x', 'y')
    const certPem = selfSigned(privateKeyPem)
    expect(certificadoMatcheaKey(certPem, privateKeyPem)).toBe(true)
  })

  it('false si son de pares distintos', () => {
    const a = generarKeypairYCsr('20123456789', 'x', 'y').privateKeyPem
    const b = generarKeypairYCsr('20123456789', 'x', 'y').privateKeyPem
    expect(certificadoMatcheaKey(selfSigned(a), b)).toBe(false)
  })

  it('false con basura (no tira)', () => {
    expect(certificadoMatcheaKey('no soy pem', 'tampoco')).toBe(false)
  })
})

describe('inspeccionarCertificado', () => {
  it('PEM basura → ok:false', () => {
    const r = inspeccionarCertificado('no soy un pem')
    expect(r.ok).toBe(false)
  })
})
