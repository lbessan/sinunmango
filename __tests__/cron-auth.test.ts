import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'

// Para evitar que los console.error de los tests ensucien la salida.
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  delete process.env.CRON_SECRET
})

function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader != null) headers.set('authorization', authHeader)
  return new NextRequest('http://localhost/api/cron/test', { headers })
}

describe('requireCronAuth', () => {
  it('sin CRON_SECRET en env → 503 (endpoint deshabilitado)', async () => {
    const res = requireCronAuth(makeReq('Bearer cualquiera'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
    const body = await res!.json()
    expect(body.error).toBe('Service unavailable')
  })

  it('con CRON_SECRET y header correcto → null (deja pasar)', () => {
    process.env.CRON_SECRET = 'mi-secret'
    const res = requireCronAuth(makeReq('Bearer mi-secret'))
    expect(res).toBeNull()
  })

  it('con CRON_SECRET pero sin header → 401', async () => {
    process.env.CRON_SECRET = 'mi-secret'
    const res = requireCronAuth(makeReq())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('con CRON_SECRET pero header incorrecto → 401', async () => {
    process.env.CRON_SECRET = 'mi-secret'
    const res = requireCronAuth(makeReq('Bearer otro'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('comparación case-sensitive: "bearer xxx" no matchea "Bearer xxx"', () => {
    process.env.CRON_SECRET = 'xxx'
    const res = requireCronAuth(makeReq('bearer xxx'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('sin el prefijo "Bearer " → 401', () => {
    process.env.CRON_SECRET = 'xxx'
    const res = requireCronAuth(makeReq('xxx'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('CRON_SECRET seteado a string vacío se trata como ausente → 503', async () => {
    process.env.CRON_SECRET = ''
    const res = requireCronAuth(makeReq('Bearer '))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
  })
})
