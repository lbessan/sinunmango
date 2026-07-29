// ─── lib/pdf-split.ts ────────────────────────────────────────────────────────
//
// Parte un PDF (base64) en varios PDFs más chicos, para procesarlos en paralelo.
//
// Por qué: los resúmenes de tarjeta de imagen (BBVA, etc.) tienen varias páginas
// pesadas. Mandarlos enteros a un modelo de visión (Sonnet) se pasa del tope de
// 60s de Vercel Hobby. Partiéndolos por página y mandando cada una en paralelo,
// cada llamada es chica y rápida, y el wall-clock total ≈ la página más lenta.
//
// Si el PDF es chico (≤2 págs) o no se puede abrir, devolvemos el original entero
// (una sola llamada) — no vale la pena partir.

import { PDFDocument } from 'pdf-lib'

/**
 * Devuelve un array de PDFs en base64. Si no hace falta partir (o falla la
 * apertura), devuelve `[base64]` (el original, una sola llamada).
 *
 * @param maxChunks tope de trozos para no disparar demasiadas llamadas en PDFs
 *                  gigantes (se agrupan páginas si hace falta).
 */
export async function splitPdfEnChunks(
  base64: string,
  { maxChunks = 12 }: { maxChunks?: number } = {},
): Promise<string[]> {
  // Todo el cuerpo va en un try: si el PDF no se puede abrir/contar/partir
  // (corrupto, formato raro), devolvemos el original entero → una sola llamada.
  try {
    const bytes = Buffer.from(base64, 'base64')
    const src   = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const total = src.getPageCount()
    if (total <= 2) return [base64]

    const pagesPerChunk = Math.max(1, Math.ceil(total / maxChunks))
    const chunks: string[] = []

    for (let start = 0; start < total; start += pagesPerChunk) {
      const out  = await PDFDocument.create()
      const idxs: number[] = []
      for (let i = start; i < Math.min(start + pagesPerChunk, total); i++) idxs.push(i)
      const copied = await out.copyPages(src, idxs)
      copied.forEach(p => out.addPage(p))
      chunks.push(Buffer.from(await out.save()).toString('base64'))
    }

    return chunks.length > 0 ? chunks : [base64]
  } catch {
    return [base64]
  }
}
