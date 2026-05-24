// Helper mínimo para mockear SupabaseClient en tests unitarios.
//
// Cubre los patterns más usados en la app:
//   - from(table).select(...).eq(...).maybeSingle()
//   - from(table).select(...).order(...).limit(...) — chain entero es thenable
//   - from(table).insert({...}) / .upsert({...}) — thenable directo
//   - from(table).update({...}).eq(...) — thenable
//   - from(table).update({...}).eq(...).select('col') — thenable
//   - from(table).delete().eq(...) — thenable
//   - from(table).select(..., { count: 'exact', head: true }).eq(...) — count
//   - rpc(name, args)
//
// El builder produce un chainable que también es thenable, así cualquier
// punto del chain (con o sin maybeSingle/single al final) resuelve a la
// respuesta configurada de la tabla.

import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type Response = { data: unknown; error: unknown; count?: number | null }

export type SupabaseMockConfig = {
  // Respuesta del terminal por tabla. Aplica a todos los terminales
  // (maybeSingle, single, await directo, .select() después de update).
  table?: Record<string, Response>
  // Respuesta de .rpc() por nombre.
  rpc?:   Record<string, Response>
}

export function createSupabaseMock(config: SupabaseMockConfig = {}) {
  const tableResponses = config.table ?? {}
  const rpcResponses   = config.rpc   ?? {}

  function buildChain(tableName: string) {
    const terminal = tableResponses[tableName] ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}

    // Métodos chainable que retornan self.
    for (const m of [
      'select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'is',
      'order', 'limit', 'range', 'not', 'or', 'filter', 'match',
      'insert', 'upsert', 'update', 'delete',
    ]) {
      chain[m] = vi.fn(() => chain)
    }

    // Terminales explícitos (.maybeSingle/.single) — los devuelven directamente.
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal))
    chain.single      = vi.fn(() => Promise.resolve(terminal))

    // Hacer el chain thenable: `await chain` resuelve a `terminal` también.
    // Esto cubre el caso "await supabase.from('t').update(x).eq('y', z)"
    // donde no hay maybeSingle/single al final.
    chain.then = (onFulfilled: (v: Response) => unknown) => {
      return Promise.resolve(terminal).then(onFulfilled)
    }

    return chain
  }

  const supabase = {
    from: vi.fn((tableName: string) => buildChain(tableName)),
    rpc:  vi.fn((rpcName: string) => {
      const resp = rpcResponses[rpcName] ?? { data: null, error: null }
      return Promise.resolve(resp)
    }),
    auth: {
      getUser: vi.fn(),
    },
  } as unknown as SupabaseClient<Database>

  return supabase
}
