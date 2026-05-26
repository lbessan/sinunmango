// ─── lib/pdf-decrypt.ts ──────────────────────────────────────────────────────
//
// Helper para detectar PDFs encriptados y extraer su texto usando unpdf
// (wrapper sobre pdf.js de Mozilla). Diseñado para servir el flow de
// /api/parsear-resumen: cuando el PDF está protegido por password,
// extraemos el texto descifrado y se lo mandamos a Claude como texto
// plano (en vez del PDF binary que Claude no puede leer encriptado).
//
// Cubre los 3 casos que arroja pdf.js al cargar un PDF:
//   - sin password (PDF no encriptado) → ok directo
//   - PasswordException code 1 → "No password given"      → requires_password
//   - PasswordException code 2 → "Incorrect Password"     → wrong_password
//
// Para PDFs no encriptados, el caller debería detectar eso ANTES de
// llamar acá y seguir mandando el PDF binary a Claude (preserva calidad
// del prompt visual). Esta lib es específica del path "necesito texto".

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; error: 'requires_password' }
  | { ok: false; error: 'wrong_password' }
  | { ok: false; error: 'unknown'; message: string }

/**
 * Detecta si un buffer PDF está encriptado, buscando el dict /Encrypt
 * en los últimos KB (donde vive el trailer). No descifra — solo señaliza.
 *
 * Hay PDFs raros que cifran solo metadata pero permiten leer el contenido
 * sin password; en esos casos esta función puede tener falsos positivos
 * pero unpdf los maneja gracefully de todas formas (extractText anda).
 */
export function isPdfEncrypted(buffer: Buffer | Uint8Array): boolean {
  // Header check: si no empieza con %PDF-, no es PDF
  if (buffer.length < 5) return false
  const header = Buffer.from(buffer.subarray(0, 5)).toString('ascii')
  if (header !== '%PDF-') return false

  // El trailer dict /Encrypt está cerca del final del archivo. Tomamos
  // los últimos 4KB para evitar leer todo el buffer en strings grandes.
  const tailSize = Math.min(buffer.length, 4096)
  const tail = Buffer.from(buffer.subarray(buffer.length - tailSize)).toString('latin1')
  return tail.includes('/Encrypt')
}

/**
 * Carga el PDF (con password si se provee), extrae todo el texto
 * mergeado en un solo string, y devuelve el resultado tipado.
 *
 * NO tira: cualquier error se mapea a un error tipado en el Result.
 * El caller decide qué hacer (pedir password al user, mostrar error, etc).
 */
export async function extractTextFromPdf(
  buffer: Buffer | Uint8Array,
  password?: string,
): Promise<ExtractResult> {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const data = buffer instanceof Uint8Array
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer)

  try {
    const proxy = await getDocumentProxy(data, password ? { password } : undefined)
    const res   = await extractText(proxy, { mergePages: true })
    // Cuando mergePages=true, `text` es string. La sobrecarga del tipo es
    // estricta y TS no la infiere acá → consultamos defensivamente.
    const raw   = res.text as unknown
    const text  = typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? (raw as string[]).join('\n')
        : ''
    if (!text.trim()) {
      return { ok: false, error: 'unknown', message: 'No se pudo extraer texto del PDF' }
    }
    return { ok: true, text }
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; code?: number }
    // PasswordException de pdf.js: code 1 = falta password, 2 = incorrecta
    if (e?.name === 'PasswordException') {
      if (e.code === 1) return { ok: false, error: 'requires_password' }
      if (e.code === 2) return { ok: false, error: 'wrong_password' }
    }
    return { ok: false, error: 'unknown', message: e?.message ?? String(err) }
  }
}
