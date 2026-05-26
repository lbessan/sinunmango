// Tests para /api/parsear-resumen, focalizados en el flow de PDFs encriptados:
//   - PDF encriptado sin password guardada ni en body → requires_password
//   - PDF encriptado con password en body que falla → wrong_password
//   - PDF encriptado con password en body que descifra → mandar texto a Claude
//   - PDF encriptado con password guardada en DB descifra → texto a Claude
//   - save_password=true → guarda cipher tras descifrar OK
//   - PDF no encriptado → path original (PDF binary a Claude)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const { createClientMock, isPdfEncryptedMock, extractTextMock, getUserPlanMock } = vi.hoisted(() => ({
  createClientMock:    vi.fn(),
  isPdfEncryptedMock:  vi.fn(),
  extractTextMock:     vi.fn(),
  getUserPlanMock:     vi.fn(),
}))

vi.mock('@/lib/supabase/route', () => ({ createClientForRequest: createClientMock }))
vi.mock('@/lib/subscription',   () => ({ getUserPlan: getUserPlanMock }))
vi.mock('@/lib/rate-limit',     () => ({ checkRateLimit: () => Promise.resolve({ allowed: true }) }))
vi.mock('@/lib/usage-limits',   () => ({
  isOnboardingActive:  () => Promise.resolve(false),
  checkMonthlyLimit:   () => Promise.resolve({ allowed: true }),
  commitMonthlyUsage:  () => Promise.resolve(null),
  usageHeaders:        () => ({}),
}))
vi.mock('@/lib/pdf-decrypt', () => ({
  isPdfEncrypted:     isPdfEncryptedMock,
  extractTextFromPdf: extractTextMock,
}))

// Crypto key para el endpoint (encrypt/decrypt cipher saved password)
process.env.RESUMEN_PASSWORD_KEY = crypto.randomBytes(32).toString('base64')
process.env.ANTHROPIC_API_KEY    = 'sk-test'

import { POST } from '@/app/api/parsear-resumen/route'
import { encryptSecret, __resetKeyCacheForTests } from '@/lib/crypto'

const ME      = '11111111-1111-1111-1111-111111111111'
const CUENTA  = 'cta_1'
const ORIG_FETCH = global.fetch

// Helper: builds un supabase mock con respuesta configurable para la query
// .from('cuentas').select(...).eq(...).maybeSingle() — usada para leer
// el cipher de la password. También captura calls a .update() para verificar
// que la password se haya guardado cuando se manda save_password=true.
function buildSupabase(opts: {
  cuentaRow?: { resumen_password_cipher?: string | null } | null
} = {}) {
  const updateCalls: Array<Record<string, unknown>> = []
  const maybeSingle = vi.fn(() => Promise.resolve({ data: opts.cuentaRow ?? null, error: null }))
  const eq2 = vi.fn(() => ({ maybeSingle, eq: eq2, update: () => updatableChain }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))

  const updatableChain = {
    eq: vi.fn(function (this: unknown) { return this }),
    then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
  }
  Object.setPrototypeOf(updatableChain, { then: updatableChain.then })

  const update = vi.fn((data: Record<string, unknown>) => {
    updateCalls.push(data)
    return updatableChain
  })

  return {
    supabase: {
      from: vi.fn(() => ({ select, update })),
    },
    updateCalls,
  }
}

// Mock de la llamada a Claude — devuelve un JSON-like válido
function mockClaude(payload: unknown) {
  global.fetch = vi.fn(async () => new Response(
    JSON.stringify({ content: [{ text: JSON.stringify(payload) }] }),
    { status: 200 },
  )) as unknown as typeof fetch
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/parsear-resumen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const FAKE_PDF_B64 = Buffer.from('%PDF-1.7\nfake content').toString('base64')

beforeEach(() => {
  createClientMock.mockReset()
  isPdfEncryptedMock.mockReset()
  extractTextMock.mockReset()
  getUserPlanMock.mockReset()
  __resetKeyCacheForTests()
  getUserPlanMock.mockResolvedValue({ has_pro_access: true })
})

afterEach(() => {
  global.fetch = ORIG_FETCH
  vi.clearAllMocks()
})

describe('POST /api/parsear-resumen — PDF encriptado', () => {
  it('PDF encriptado sin password en body ni en DB → 422 requires_password', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({ cuentaRow: { resumen_password_cipher: null } }).supabase,
    })
    isPdfEncryptedMock.mockReturnValueOnce(true)

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('requires_password')
  })

  it('PDF encriptado sin cuenta_id (sin DB) y sin password → requires_password', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase().supabase,
    })
    isPdfEncryptedMock.mockReturnValueOnce(true)

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64 }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('requires_password')
  })

  it('PDF encriptado con password incorrecta → 422 wrong_password', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase().supabase,
    })
    isPdfEncryptedMock.mockReturnValueOnce(true)
    extractTextMock.mockResolvedValueOnce({ ok: false, error: 'wrong_password' })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, resumen_password: 'bad' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('wrong_password')
  })

  it('PDF encriptado, password en body descifra → 200 con transacciones', async () => {
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase().supabase,
    })
    isPdfEncryptedMock.mockReturnValueOnce(true)
    extractTextMock.mockResolvedValueOnce({ ok: true, text: 'Resumen Mayo 2026\nConsumo X $1000' })
    mockClaude({ transacciones: [{ fecha: '2026-05-01', detalle: 'X', monto_ars: 1000 }] })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, resumen_password: '30123456' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transacciones).toHaveLength(1)
  })

  it('PDF encriptado, password en DB descifra → 200', async () => {
    const savedCipher = encryptSecret('30123456')
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase: buildSupabase({ cuentaRow: { resumen_password_cipher: savedCipher } }).supabase,
    })
    isPdfEncryptedMock.mockReturnValueOnce(true)
    extractTextMock.mockResolvedValueOnce({ ok: true, text: 'Texto extraído' })
    mockClaude({ transacciones: [] })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, cuenta_id: CUENTA }))
    expect(res.status).toBe(200)
    // La password de la DB se usó para llamar extractText
    expect(extractTextMock).toHaveBeenCalledWith(expect.anything(), '30123456')
  })

  it('save_password=true + descifrado OK → guarda cipher en cuenta', async () => {
    const { supabase, updateCalls } = buildSupabase()
    createClientMock.mockResolvedValueOnce({
      user: { id: ME },
      supabase,
    })
    isPdfEncryptedMock.mockReturnValueOnce(true)
    extractTextMock.mockResolvedValueOnce({ ok: true, text: 'ok' })
    mockClaude({ transacciones: [] })

    const res = await POST(makeReq({
      pdf: FAKE_PDF_B64,
      cuenta_id: CUENTA,
      resumen_password: '30123456',
      save_password: true,
    }))
    expect(res.status).toBe(200)

    // El update se llamó con un cipher (no con el plaintext)
    const upd = updateCalls.find(u => 'resumen_password_cipher' in u)
    expect(upd).toBeTruthy()
    expect(upd!.resumen_password_cipher).not.toBe('30123456')
    expect(typeof upd!.resumen_password_cipher).toBe('string')
  })

  it('save_password=true sin cuenta_id → no guarda (no hay donde)', async () => {
    const { supabase, updateCalls } = buildSupabase()
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase })
    isPdfEncryptedMock.mockReturnValueOnce(true)
    extractTextMock.mockResolvedValueOnce({ ok: true, text: 'ok' })
    mockClaude({ transacciones: [] })

    const res = await POST(makeReq({
      pdf: FAKE_PDF_B64,
      resumen_password: '30123456',
      save_password: true,
      // sin cuenta_id
    }))
    expect(res.status).toBe(200)
    // No hubo update con resumen_password_cipher
    const upd = updateCalls.find(u => 'resumen_password_cipher' in u)
    expect(upd).toBeUndefined()
  })

  it('PDF encriptado, descifrado retorna error unknown → 422 decrypt_failed', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: buildSupabase().supabase })
    isPdfEncryptedMock.mockReturnValueOnce(true)
    extractTextMock.mockResolvedValueOnce({ ok: false, error: 'unknown', message: 'PDF roto' })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64, resumen_password: 'x' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('decrypt_failed')
  })

  it('PDF NO encriptado → path original (no llama a extractText)', async () => {
    createClientMock.mockResolvedValueOnce({ user: { id: ME }, supabase: buildSupabase().supabase })
    isPdfEncryptedMock.mockReturnValueOnce(false)
    mockClaude({ transacciones: [{ fecha: '2026-05-01', detalle: 'A', monto_ars: 500 }] })

    const res = await POST(makeReq({ pdf: FAKE_PDF_B64 }))
    expect(res.status).toBe(200)
    expect(extractTextMock).not.toHaveBeenCalled()
  })
})
