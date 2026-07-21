// ─── lib/afip-sync.ts ────────────────────────────────────────────────────────
//
// Aplica un snapshot de monotributo (traído de ARCA vía Afip SDK) a la DB:
//   - monotributo_config: categoría, límite (tope) y costo mensual → así el
//     resto de la app (dashboard, analítica, alertas) usa valores frescos sin
//     que el usuario cargue nada a mano.
//   - afip_conexion: guarda el snapshot completo + marca la conexión conectada.
//
// Reutilizable por el endpoint de sync y por un cron de sync automática.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import type { MonotributoSync } from '@/lib/afipsdk'

type DB = SupabaseClient<Database>

/**
 * Vuelca categoría/tope/cuota del snapshot a monotributo_config.
 *  - Si ya existe config: actualiza solo los campos que trajimos (preserva
 *    actividad, gasto_fijo_id, notas que puso el usuario).
 *  - Si no existe: la crea, pero solo si el snapshot trae los 3 obligatorios
 *    (categoría + tope + cuota); si no, no se puede armar una config válida.
 * Devuelve true si escribió la config.
 */
export async function aplicarConfigMonotributo(
  supabase: DB,
  userId: string,
  sync: MonotributoSync,
): Promise<boolean> {
  const patch: Database['public']['Tables']['monotributo_config']['Update'] = {}
  if (sync.categoria) patch.categoria = sync.categoria
  if (sync.topeCategoria != null) patch.limite_facturacion_anual = sync.topeCategoria
  if (sync.cuotaMensual != null) patch.costo_mensual = sync.cuotaMensual

  const { data: existing } = await supabase
    .from('monotributo_config')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    if (Object.keys(patch).length === 0) return false
    const { error } = await supabase.from('monotributo_config').update(patch).eq('user_id', userId)
    return !error
  }

  // Insert: la config requiere categoría + límite + costo (NOT NULL).
  if (patch.categoria && patch.limite_facturacion_anual != null && patch.costo_mensual != null) {
    const { error } = await supabase.from('monotributo_config').insert({
      user_id: userId,
      categoria: patch.categoria,
      limite_facturacion_anual: patch.limite_facturacion_anual,
      costo_mensual: patch.costo_mensual,
      actividad: 'servicios',
      vigente_desde: new Date().toISOString().slice(0, 10),
    })
    return !error
  }
  return false
}

/** Marca la conexión conectada y guarda el snapshot completo. */
export async function guardarSnapshotConexion(
  supabase: DB,
  userId: string,
  sync: MonotributoSync,
): Promise<void> {
  await supabase
    .from('afip_conexion')
    .update({
      estado: 'conectado',
      metodo: 'clave_fiscal',
      sync_data: sync as unknown as Json,
      sync_error: null,
      sync_job_id: null,
      ultima_sync: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

/** Registra un error de sync en la conexión (sin tocar la config). */
export async function marcarErrorSync(supabase: DB, userId: string, mensaje: string): Promise<void> {
  await supabase
    .from('afip_conexion')
    .update({ estado: 'error', sync_error: mensaje.slice(0, 500), sync_job_id: null })
    .eq('user_id', userId)
}

/** Aplica el snapshot completo: config (best-effort) + snapshot en la conexión. */
export async function aplicarSync(
  supabase: DB,
  userId: string,
  sync: MonotributoSync,
): Promise<{ configActualizada: boolean }> {
  const configActualizada = await aplicarConfigMonotributo(supabase, userId, sync)
  await guardarSnapshotConexion(supabase, userId, sync)
  return { configActualizada }
}
