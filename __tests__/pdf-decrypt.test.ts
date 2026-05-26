// Tests para lib/pdf-decrypt.ts
//
// Cubre:
//   - isPdfEncrypted detection
//     · PDF con /Encrypt en trailer → true
//     · PDF sin /Encrypt → false
//     · buffer no-PDF (sin header) → false
//   - extractTextFromPdf error paths (con mock de unpdf)
//     · sin password en PDF encriptado → requires_password
//     · password incorrecta → wrong_password
//     · error genérico → unknown con message
//     · texto vacío → unknown "No se pudo extraer texto"
//     · happy path → ok con text
//
// El test real contra el PDF de muestra de Mercado Pago se hace
// manualmente con la password del user — acá solo tests unitarios
// con mocks del comportamiento de unpdf.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getDocProxyMock, extractTextMock } = vi.hoisted(() => ({
  getDocProxyMock:  vi.fn(),
  extractTextMock:  vi.fn(),
}))

vi.mock('unpdf', () => ({
  getDocumentProxy: getDocProxyMock,
  extractText:      extractTextMock,
}))

import { isPdfEncrypted, extractTextFromPdf } from '@/lib/pdf-decrypt'

beforeEach(() => {
  getDocProxyMock.mockReset()
  extractTextMock.mockReset()
})

// ─── isPdfEncrypted ─────────────────────────────────────────────────────────
describe('isPdfEncrypted', () => {
  it('PDF con /Encrypt en trailer → true', () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.from('x'.repeat(200)),
      Buffer.from('trailer<</Size 71/Root 1 0 R/Encrypt 70 0 R>>\nstartxref\n100\n%%EOF'),
    ])
    expect(isPdfEncrypted(pdf)).toBe(true)
  })

  it('PDF sin /Encrypt → false', () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.from('x'.repeat(200)),
      Buffer.from('trailer<</Size 71/Root 1 0 R>>\nstartxref\n100\n%%EOF'),
    ])
    expect(isPdfEncrypted(pdf)).toBe(false)
  })

  it('buffer sin header PDF → false', () => {
    const notPdf = Buffer.from('Hello /Encrypt this is not a PDF')
    expect(isPdfEncrypted(notPdf)).toBe(false)
  })

  it('buffer demasiado corto → false', () => {
    expect(isPdfEncrypted(Buffer.from('%PD'))).toBe(false)
  })

  it('Uint8Array funciona igual que Buffer', () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.from('x'.repeat(100)),
      Buffer.from('trailer<</Encrypt 5 0 R>>\n%%EOF'),
    ])
    const arr = new Uint8Array(pdf)
    expect(isPdfEncrypted(arr)).toBe(true)
  })
})

// ─── extractTextFromPdf ─────────────────────────────────────────────────────
describe('extractTextFromPdf', () => {
  it('happy path: devuelve text mergeado', async () => {
    getDocProxyMock.mockResolvedValueOnce({ /* PDFDocumentProxy mock */ })
    extractTextMock.mockResolvedValueOnce({ text: 'Hola mundo del PDF', pageCount: 1 })

    const result = await extractTextFromPdf(Buffer.from('fake-pdf'), 'mypass')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe('Hola mundo del PDF')
  })

  it('text como array → se mergea con join', async () => {
    getDocProxyMock.mockResolvedValueOnce({})
    extractTextMock.mockResolvedValueOnce({ text: ['p1', 'p2'], pageCount: 2 })

    const result = await extractTextFromPdf(Buffer.from('fake-pdf'), 'mypass')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe('p1\np2')
  })

  it('PasswordException code 1 → requires_password', async () => {
    const err = new Error('No password given') as Error & { name: string; code: number }
    err.name = 'PasswordException'
    err.code = 1
    getDocProxyMock.mockRejectedValueOnce(err)

    const result = await extractTextFromPdf(Buffer.from('x'))
    expect(result).toEqual({ ok: false, error: 'requires_password' })
  })

  it('PasswordException code 2 → wrong_password', async () => {
    const err = new Error('Incorrect Password') as Error & { name: string; code: number }
    err.name = 'PasswordException'
    err.code = 2
    getDocProxyMock.mockRejectedValueOnce(err)

    const result = await extractTextFromPdf(Buffer.from('x'), 'wrong')
    expect(result).toEqual({ ok: false, error: 'wrong_password' })
  })

  it('error genérico → unknown con message', async () => {
    getDocProxyMock.mockRejectedValueOnce(new Error('PDF corrupto'))

    const result = await extractTextFromPdf(Buffer.from('x'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unknown')
      if (result.error === 'unknown') expect(result.message).toContain('PDF corrupto')
    }
  })

  it('texto vacío extraído → unknown', async () => {
    getDocProxyMock.mockResolvedValueOnce({})
    extractTextMock.mockResolvedValueOnce({ text: '   \n  ', pageCount: 1 })

    const result = await extractTextFromPdf(Buffer.from('x'), 'pass')
    expect(result.ok).toBe(false)
    if (!result.ok && result.error === 'unknown') {
      expect(result.message).toMatch(/No se pudo extraer texto/)
    }
  })

  it('sin password no se manda el field a getDocumentProxy', async () => {
    getDocProxyMock.mockResolvedValueOnce({})
    extractTextMock.mockResolvedValueOnce({ text: 'ok', pageCount: 1 })

    await extractTextFromPdf(Buffer.from('x'))
    // El 2do argumento es undefined si no hay password
    expect(getDocProxyMock).toHaveBeenCalledWith(expect.any(Uint8Array), undefined)
  })

  it('con password se pasa en el options object', async () => {
    getDocProxyMock.mockResolvedValueOnce({})
    extractTextMock.mockResolvedValueOnce({ text: 'ok', pageCount: 1 })

    await extractTextFromPdf(Buffer.from('x'), 'mypass')
    expect(getDocProxyMock).toHaveBeenCalledWith(expect.any(Uint8Array), { password: 'mypass' })
  })

  it('PasswordException sin code conocido → unknown', async () => {
    const err = new Error('weird state') as Error & { name: string; code?: number }
    err.name = 'PasswordException'
    // sin code (undefined)
    getDocProxyMock.mockRejectedValueOnce(err)

    const result = await extractTextFromPdf(Buffer.from('x'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unknown')
  })
})
