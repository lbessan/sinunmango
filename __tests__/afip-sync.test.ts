// Tests para lib/afip-sync.ts — volcado del snapshot de ARCA a la DB.
import { describe, it, expect, vi } from 'vitest'
import { aplicarConfigMonotributo, guardarSnapshotConexion, aplicarSync } from '@/lib/afip-sync'
import type { MonotributoSync } from '@/lib/afipsdk'

const SNAP_FULL: MonotributoSync = {
  categoria: 'C',
  facturado: 5_000_000,
  fechaFacturado: '12/11/2025',
  topeCategoria: 24_000_000,
  proximoVencimiento: '20/11/2025',
  cuotaMensual: 60_000,
}

// Mock del cliente supabase con captura de update/insert por tabla.
function buildSupabase(existingConfig: Record<string, unknown> | null) {
  const calls = {
    configUpdate: [] as Record<string, unknown>[],
    configInsert: [] as Record<string, unknown>[],
    conexionUpdate: [] as Record<string, unknown>[],
  }
  function table(name: string) {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: name === 'monotributo_config' ? existingConfig : null, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        if (name === 'monotributo_config') calls.configUpdate.push(patch)
        else if (name === 'afip_conexion') calls.conexionUpdate.push(patch)
        return { eq: () => Promise.resolve({ error: null }) }
      },
      insert: (row: Record<string, unknown>) => {
        if (name === 'monotributo_config') calls.configInsert.push(row)
        return Promise.resolve({ error: null })
      },
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = { from: vi.fn((name: string) => table(name)) } as any
  return { supabase, calls }
}

const ME = 'user-1'

describe('aplicarConfigMonotributo', () => {
  it('config existente → update parcial con categoría/tope/cuota', async () => {
    const { supabase, calls } = buildSupabase({ user_id: ME })
    const ok = await aplicarConfigMonotributo(supabase, ME, SNAP_FULL)
    expect(ok).toBe(true)
    expect(calls.configInsert).toHaveLength(0)
    expect(calls.configUpdate[0]).toEqual({
      categoria: 'C',
      limite_facturacion_anual: 24_000_000,
      costo_mensual: 60_000,
    })
  })

  it('sin config previa + snapshot completo → insert con los 3 obligatorios', async () => {
    const { supabase, calls } = buildSupabase(null)
    const ok = await aplicarConfigMonotributo(supabase, ME, SNAP_FULL)
    expect(ok).toBe(true)
    expect(calls.configUpdate).toHaveLength(0)
    expect(calls.configInsert[0]).toMatchObject({
      user_id: ME,
      categoria: 'C',
      limite_facturacion_anual: 24_000_000,
      costo_mensual: 60_000,
      actividad: 'servicios',
    })
  })

  it('sin config previa + snapshot incompleto (falta cuota) → NO inserta', async () => {
    const { supabase, calls } = buildSupabase(null)
    const ok = await aplicarConfigMonotributo(supabase, ME, { ...SNAP_FULL, cuotaMensual: null })
    expect(ok).toBe(false)
    expect(calls.configInsert).toHaveLength(0)
  })

  it('config existente + snapshot vacío → no toca nada', async () => {
    const { supabase, calls } = buildSupabase({ user_id: ME })
    const ok = await aplicarConfigMonotributo(supabase, ME, {
      categoria: null, facturado: null, fechaFacturado: null,
      topeCategoria: null, proximoVencimiento: null, cuotaMensual: null,
    })
    expect(ok).toBe(false)
    expect(calls.configUpdate).toHaveLength(0)
  })
})

describe('guardarSnapshotConexion', () => {
  it('marca conectado y guarda el snapshot', async () => {
    const { supabase, calls } = buildSupabase(null)
    await guardarSnapshotConexion(supabase, ME, SNAP_FULL)
    expect(calls.conexionUpdate[0]).toMatchObject({
      estado: 'conectado',
      metodo: 'clave_fiscal',
      sync_error: null,
      sync_job_id: null,
    })
    expect((calls.conexionUpdate[0].sync_data as MonotributoSync).categoria).toBe('C')
    expect(calls.conexionUpdate[0].ultima_sync).toBeTruthy()
  })
})

describe('aplicarSync', () => {
  it('actualiza config y conexión de una', async () => {
    const { supabase, calls } = buildSupabase({ user_id: ME })
    const res = await aplicarSync(supabase, ME, SNAP_FULL)
    expect(res.configActualizada).toBe(true)
    expect(calls.configUpdate).toHaveLength(1)
    expect(calls.conexionUpdate).toHaveLength(1)
  })
})
