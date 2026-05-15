// Helper mínimo para mockear SupabaseClient en tests unitarios.
//
// Solo cubre los métodos que los libs realmente usan:
//   from -> select -> [eq...] -> maybeSingle/single
//   rpc(name, args)
//
// Para casos más complejos (storage, auth.admin.getUserById, etc.) extender acá.

import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type Response = { data: unknown; error: unknown }

export type SupabaseMockConfig = {
  // Respuesta del terminal (.maybeSingle()/.single()) por tabla.
  // Si no se setea, devuelve { data: null, error: null }.
  table?: Record<string, Response>
  // Respuesta de .rpc() por nombre.
  rpc?:   Record<string, Response>
}

export function createSupabaseMock(config: SupabaseMockConfig = {}) {
  // Cada chain de la forma from(table).select(...).eq(...).eq(...).maybeSingle()
  // tiene que terminar en una promesa. Hacemos un proxy que devuelve self para
  // todos los métodos chainable y resuelve al llegar a maybeSingle/single.
  const tableResponses = config.table ?? {}
  const rpcResponses   = config.rpc   ?? {}

  function buildChain(tableName: string) {
    const terminal = tableResponses[tableName] ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}

    // Métodos chainable que retornan self.
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'not']) {
      chain[m] = vi.fn(() => chain)
    }

    // Terminales que retornan una promesa con la respuesta configurada.
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal))
    chain.single      = vi.fn(() => Promise.resolve(terminal))

    return chain
  }

  const supabase = {
    from: vi.fn((tableName: string) => buildChain(tableName)),
    rpc:  vi.fn((rpcName: string) => {
      const resp = rpcResponses[rpcName] ?? { data: null, error: null }
      return Promise.resolve(resp)
    }),
  } as unknown as SupabaseClient<Database>

  return supabase
}
