// Tests para splitPdfEnChunks — parte un PDF en trozos para procesar en paralelo.
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { splitPdfEnChunks } from '@/lib/pdf-split'

async function makePdf(pages: number): Promise<string> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save()).toString('base64')
}
async function pageCount(base64: string): Promise<number> {
  return (await PDFDocument.load(Buffer.from(base64, 'base64'))).getPageCount()
}

describe('splitPdfEnChunks', () => {
  it('no parte PDFs de 1-2 páginas (devuelve el original entero)', async () => {
    const pdf1 = await makePdf(1)
    expect(await splitPdfEnChunks(pdf1)).toEqual([pdf1])
    const pdf2 = await makePdf(2)
    expect(await splitPdfEnChunks(pdf2)).toEqual([pdf2])
  })

  it('parte un PDF de 6 páginas en 6 chunks de 1 página', async () => {
    const chunks = await splitPdfEnChunks(await makePdf(6))
    expect(chunks).toHaveLength(6)
    for (const c of chunks) expect(await pageCount(c)).toBe(1)
  })

  it('agrupa páginas para no pasar el tope de chunks, sin perder ninguna', async () => {
    const chunks = await splitPdfEnChunks(await makePdf(25), { maxChunks: 12 })
    expect(chunks.length).toBeLessThanOrEqual(12)
    let total = 0
    for (const c of chunks) total += await pageCount(c)
    expect(total).toBe(25)  // 25 páginas repartidas, ninguna se pierde
  })

  it('base64 corrupto → devuelve el original (fallback a una sola llamada)', async () => {
    const bad = Buffer.from('esto no es un pdf').toString('base64')
    expect(await splitPdfEnChunks(bad)).toEqual([bad])
  })
})
