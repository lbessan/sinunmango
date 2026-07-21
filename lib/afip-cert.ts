// ─── lib/afip-cert.ts ────────────────────────────────────────────────────────
//
// Genera el par de claves RSA + CSR (PKCS#10) que el usuario sube a AFIP/ARCA
// (servicio WSASS) para obtener su certificado digital. Con ese certificado la
// plataforma consulta después sus datos de monotributo (categoría, facturación)
// vía web services — sin manejar nunca su clave fiscal.
//
// Subject EXIGIDO por AFIP:
//   /C=AR/O={nombre}/CN={alias}/serialNumber=CUIT {cuit}
//   (serialNumber = la palabra "CUIT", un espacio, y los 11 dígitos sin guiones)
//
// La clave privada se genera acá (server-only) y se guarda ENCRIPTADA; nunca
// se expone al cliente ni sale de la plataforma.

import forge from 'node-forge'

export type CsrResult = { csrPem: string; privateKeyPem: string }

const CUIT_RE = /^\d{11}$/

/** Normaliza un CUIT a 11 dígitos (saca guiones/espacios). Tira si no es válido. */
export function normalizarCuit(cuit: string): string {
  const c = (cuit ?? '').replace(/\D/g, '')
  if (!CUIT_RE.test(c)) throw new Error('CUIT inválido: deben ser 11 dígitos')
  return c
}

/**
 * Genera el keypair RSA 2048 + el CSR con el subject que pide AFIP.
 * Devuelve el CSR (para pegar en WSASS) y la clave privada (para guardar cifrada).
 */
export function generarKeypairYCsr(cuit: string, nombre: string, alias: string): CsrResult {
  const c = normalizarCuit(cuit)
  const org = (nombre || 'sinunmango').trim().slice(0, 60) || 'sinunmango'
  const cn = ((alias || 'sinunmango').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'sinunmango').slice(0, 40)

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  csr.setSubject([
    { shortName: 'C', value: 'AR' },
    { shortName: 'O', value: org },
    { shortName: 'CN', value: cn },
    { type: '2.5.4.5', value: `CUIT ${c}` }, // serialNumber (OID 2.5.4.5)
  ])
  csr.sign(keys.privateKey, forge.md.sha256.create())

  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

/**
 * Valida que el PEM que pega el usuario sea un certificado X.509 parseable.
 * No lo valida contra AFIP (eso se hace al primer WSAA), solo formato + vigencia.
 */
export function inspeccionarCertificado(certPem: string):
  | { ok: true; notAfter: string; vencido: boolean }
  | { ok: false; error: string } {
  try {
    const cert = forge.pki.certificateFromPem(certPem)
    const notAfter = cert.validity.notAfter
    return { ok: true, notAfter: notAfter.toISOString(), vencido: notAfter.getTime() < Date.now() }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'PEM inválido' }
  }
}
