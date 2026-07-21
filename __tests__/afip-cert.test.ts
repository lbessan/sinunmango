// Tests para lib/afip-cert.ts — generación del CSR para AFIP.
import { describe, it, expect } from 'vitest'
import forge from 'node-forge'
import { generarKeypairYCsr, normalizarCuit, inspeccionarCertificado } from '@/lib/afip-cert'

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

describe('inspeccionarCertificado', () => {
  it('PEM basura → ok:false', () => {
    const r = inspeccionarCertificado('no soy un pem')
    expect(r.ok).toBe(false)
  })
})
