// Tests para GET /api/me/export
//
// Genera un ZIP con todos los datos del user (CSV + perfil.json + README).
// Cubrimos:
//   - 401 sin user
//   - Headers correctos (Content-Type, Content-Disposition, Cache-Control)
//   - ZIP contiene los files esperados
//   - CSV se genera con headers + rows
//   - Errores por tabla individual no rompen el export (file con error)
//   - perfil.json incluye info del user + profile + exported_at

import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'
import { NextRequest } from 'next/server'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/route', () => ({
  createClientForRequest: createClientMock,
}))

import { GET } from '@/app/api/me/export/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/me/export')
}

type SetupOpts = {
  user:        { id: string; email?: string; created_at?: string; last_sign_in_at?: string } | null
  profile?:    unknown
  tables?:     Record<string, { data?: unknown[] | null; error?: { message: string } | null }>
}

function setupSupabase(opts: SetupOpts) {
  const tables = opts.tables ?? {}

  const from = vi.fn((tableName: string) => {
    // Default response per table; user_profiles tiene su propio path con .single()
    const tableResponse = tableName === 'user_profiles'
      ? { single: () => Promise.resolve({ data: opts.profile ?? null, error: null }) }
      : null

    if (tableResponse) {
      const eq = vi.fn(() => tableResponse)
      const select = vi.fn(() => ({ eq }))
      return { select }
    }

    // Para tablas de datos: select('*').eq('user_id', x) — thenable directo
    const resp = tables[tableName] ?? { data: [], error: null }
    const eq = vi.fn(() => Promise.resolve(resp))
    const select = vi.fn(() => ({ eq }))
    return { select }
  })

  createClientMock.mockResolvedValueOnce({ supabase: { from }, user: opts.user })
  return { from }
}

beforeEach(() => {
  createClientMock.mockReset()
})

async function loadZip(res: Response): Promise<JSZip> {
  const buf = await res.arrayBuffer()
  return JSZip.loadAsync(buf)
}

describe('GET /api/me/export — auth', () => {
  it('401 sin user', async () => {
    createClientMock.mockResolvedValueOnce({ supabase: {}, user: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })
})

describe('GET /api/me/export — headers', () => {
  it('Content-Type es application/zip', async () => {
    setupSupabase({ user: { id: 'u', email: 'a@b.com' } })
    const res = await GET(makeReq())
    expect(res.headers.get('Content-Type')).toBe('application/zip')
  })

  it('Content-Disposition tiene filename con fecha de hoy', async () => {
    setupSupabase({ user: { id: 'u', email: 'a@b.com' } })
    const res = await GET(makeReq())
    const cd = res.headers.get('Content-Disposition')
    expect(cd).toContain('attachment')
    expect(cd).toContain('sinunmango-export-')
    expect(cd).toMatch(/\d{4}-\d{2}-\d{2}\.zip/)
  })

  it('Cache-Control es no-store (datos sensibles)', async () => {
    setupSupabase({ user: { id: 'u', email: 'a@b.com' } })
    const res = await GET(makeReq())
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('GET /api/me/export — contenido del ZIP', () => {
  it('incluye README.txt + perfil.json + todos los CSVs esperados', async () => {
    setupSupabase({ user: { id: 'u', email: 'a@b.com' } })
    const res = await GET(makeReq())
    const zip = await loadZip(res)

    const expected = [
      'README.txt',
      'perfil.json',
      'cuentas.csv',
      'categorias.csv',
      'subcategorias.csv',
      'movimientos.csv',
      'gastos_fijos.csv',
      'inversiones.csv',
      'parametros.csv',
    ]
    for (const f of expected) {
      expect(zip.file(f)).not.toBeNull()
    }
  })

  it('perfil.json contiene id, email, profile, exported_at', async () => {
    setupSupabase({
      user: { id: 'user-uuid', email: 'me@test.com', created_at: '2025-01-01', last_sign_in_at: '2026-05-24' },
      profile: { plan: 'pro', plan_expires_at: '2027-01-01' },
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const perfil = JSON.parse(await zip.file('perfil.json')!.async('string'))

    expect(perfil.id).toBe('user-uuid')
    expect(perfil.email).toBe('me@test.com')
    expect(perfil.created_at).toBe('2025-01-01')
    expect(perfil.last_sign_in).toBe('2026-05-24')
    expect(perfil.profile).toEqual({ plan: 'pro', plan_expires_at: '2027-01-01' })
    expect(perfil.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('perfil.json funciona aunque profile sea null', async () => {
    setupSupabase({
      user: { id: 'u', email: 'x@y.com' },
      profile: null,
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const perfil = JSON.parse(await zip.file('perfil.json')!.async('string'))
    expect(perfil.profile).toBeNull()
  })

  it('CSV de tabla vacía es string vacío', async () => {
    setupSupabase({
      user: { id: 'u', email: 'a@b.com' },
      tables: { cuentas: { data: [], error: null } },
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const csv = await zip.file('cuentas.csv')!.async('string')
    expect(csv).toBe('')
  })

  it('CSV con rows incluye headers + filas', async () => {
    setupSupabase({
      user: { id: 'u', email: 'a@b.com' },
      tables: {
        cuentas: {
          data: [
            { id: 1, nombre_cuenta: 'Galicia', tipo_cuenta: 'banco' },
            { id: 2, nombre_cuenta: 'Mercado Pago', tipo_cuenta: 'billetera' },
          ],
          error: null,
        },
      },
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const csv = await zip.file('cuentas.csv')!.async('string')

    const lines = csv.split('\n')
    expect(lines[0]).toBe('id,nombre_cuenta,tipo_cuenta')
    expect(lines[1]).toBe('1,Galicia,banco')
    expect(lines[2]).toBe('2,Mercado Pago,billetera')
  })

  it('CSV escapa correctamente valores con coma, comillas y newlines (RFC 4180)', async () => {
    setupSupabase({
      user: { id: 'u', email: 'a@b.com' },
      tables: {
        movimientos: {
          data: [
            { detalle: 'gasto, con coma',          monto: 100 },
            { detalle: 'gasto con "comillas"',     monto: 200 },
            { detalle: 'multi\nlínea',             monto: 300 },
            { detalle: 'simple',                   monto: 400 },
          ],
          error: null,
        },
      },
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const csv = await zip.file('movimientos.csv')!.async('string')

    expect(csv).toContain('"gasto, con coma"')
    expect(csv).toContain('"gasto con ""comillas"""')
    expect(csv).toContain('"multi\nlínea"')
    // Strings simples sin caracteres especiales no van comillados
    expect(csv).toMatch(/simple,400/)
  })

  it('CSV trata null/undefined como string vacío', async () => {
    setupSupabase({
      user: { id: 'u', email: 'a@b.com' },
      tables: {
        cuentas: {
          data: [{ id: 1, descripcion: null, fecha: undefined }],
          error: null,
        },
      },
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const csv = await zip.file('cuentas.csv')!.async('string')
    expect(csv).toContain('1,,')
  })

  it('CSV serializa objects como JSON inline', async () => {
    setupSupabase({
      user: { id: 'u', email: 'a@b.com' },
      tables: {
        inversiones: {
          data: [{ id: 1, datos: { tipo: 'plazo_fijo', monto: 100 } }],
          error: null,
        },
      },
    })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const csv = await zip.file('inversiones.csv')!.async('string')
    // El JSON contiene comillas → todo el campo va entre comillas dobles con escape
    expect(csv).toContain('"{""tipo"":""plazo_fijo"",""monto"":100}"')
  })

  it('error en una tabla individual no rompe el resto del export', async () => {
    setupSupabase({
      user: { id: 'u', email: 'a@b.com' },
      tables: {
        cuentas:     { data: [{ id: 1 }], error: null },
        movimientos: { data: null, error: { message: 'permission denied' } },
      },
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const zip = await loadZip(res)

    // cuentas.csv tiene los datos normales
    const cuentasCsv = await zip.file('cuentas.csv')!.async('string')
    expect(cuentasCsv).toContain('id\n1')

    // movimientos.csv tiene el mensaje de error en comentario
    const movsCsv = await zip.file('movimientos.csv')!.async('string')
    expect(movsCsv).toContain('# Error')
    expect(movsCsv).toContain('permission denied')

    consoleWarn.mockRestore()
  })

  it('README.txt incluye email del user y la fecha', async () => {
    setupSupabase({ user: { id: 'u', email: 'tester@example.com' } })
    const res = await GET(makeReq())
    const zip = await loadZip(res)
    const readme = await zip.file('README.txt')!.async('string')

    expect(readme).toContain('tester@example.com')
    expect(readme).toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(readme).toContain('sinunmango')
    // Documenta los archivos
    expect(readme).toContain('cuentas.csv')
    expect(readme).toContain('movimientos.csv')
  })

  it('README.txt funciona aunque email sea undefined', async () => {
    setupSupabase({ user: { id: 'u' } })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
  })
})
