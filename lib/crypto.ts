// ─── lib/crypto.ts ───────────────────────────────────────────────────────────
//
// Encriptación simétrica para secrets at-rest. Usado para guardar la
// password del PDF del resumen de tarjeta en cuentas.resumen_password_cipher.
//
// Algoritmo: AES-256-GCM
//   - 256 bits de key (32 bytes), de la env var RESUMEN_PASSWORD_KEY (base64).
//   - 96 bits de IV (12 bytes), randomizados por encryption.
//   - 128 bits de auth tag (16 bytes), validados al desencriptar.
//
// Format del cipher en DB (base64): IV (12) ++ AUTH_TAG (16) ++ CIPHERTEXT (var)
//
// Para generar una key nueva (32 bytes base64):
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import crypto from 'crypto'

const KEY_ENV = 'RESUMEN_PASSWORD_KEY'

// Resolución de la key:
//   - Se lee de env la primera vez que se usa y se cachea.
//   - Si falta o tiene tamaño incorrecto, las llamadas a encrypt/decrypt
//     tiran error explícito. Esto vive del lado server (admin/route), no
//     se exporta al cliente.
let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const b64 = process.env[KEY_ENV]
  if (!b64) {
    throw new Error(
      `${KEY_ENV} no configurada. Generá una con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    )
  }
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} inválida — debe ser 32 bytes en base64 (recibimos ${key.length}).`)
  }
  cachedKey = key
  return key
}

/**
 * Solo para tests: limpiar la cache de key. No usar desde código de prod.
 */
export function __resetKeyCacheForTests(): void {
  cachedKey = null
}

/**
 * Encripta un string (utf-8). Devuelve base64.
 *
 * El resultado incluye IV + auth tag, así que decrypt() puede operar sin
 * ningún metadato adicional.
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptSecret: plaintext debe ser string')
  }
  const key    = getKey()
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/**
 * Desencripta lo que produjo encryptSecret(). Devuelve null si:
 *   - el cipher está mal formado (largo < 28 bytes)
 *   - el auth tag no valida (cipher manipulado o key incorrecta)
 *   - cualquier otro error de crypto
 *
 * NO tira: queremos que el caller decida qué hacer con un secret invalid
 * (ej: tratar como "no hay password guardada" y pedirla al user).
 */
export function decryptSecret(stored: string): string | null {
  if (typeof stored !== 'string' || stored.length === 0) return null
  try {
    const key = getKey()
    const buf = Buffer.from(stored, 'base64')
    if (buf.length < 12 + 16) return null   // IV + tag (payload puede ser vacío)
    const iv  = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(enc), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return null
  }
}
