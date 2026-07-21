// ─── /api/monotributo/afip/sincronizar ───────────────────────────────────────
//
// Sincroniza el monotributo desde ARCA vía Afip SDK (automation monotributo-info).
// Patrón fire-and-poll (para no colgar la función en Vercel):
//   POST  → valida, arranca la automation en Afip SDK, guarda la conexión
//           (clave fiscal encriptada solo si el usuario lo pidió) y devuelve
//           { status: 'in_process', jobId } (o el resultado si ya vino listo).
//   GET ?jobId=… → pollea el job; cuando termina, vuelca categoría/tope/cuota a
//           monotributo_config y devuelve el snapshot.
//
// La clave fiscal viaja por HTTPS a nuestro server, se usa solo para esta
// consulta, se guarda encriptada (AES-256-GCM) y NUNCA se devuelve ni se loguea.

import { createClientForRequest } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/database.types'
import { normalizarCuit } from '@/lib/afip-cert'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import {
  iniciarMonotributo,
  consultarJob,
  jobEnProceso,
  jobConError,
  mensajeErrorJob,
  normalizarMonotributo,
  AfipSdkError,
} from '@/lib/afipsdk'
import { aplicarSync, marcarErrorSync } from '@/lib/afip-sync'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>

  let cuit: string
  try { cuit = normalizarCuit(String(raw.cuit ?? '')) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

  let clave = String(raw.clave ?? '')
  // Sin clave en el body → probamos la que el usuario ya guardó (re-sync).
  if (!clave.trim()) {
    const { data } = await supabase
      .from('afip_conexion').select('clave_cipher').eq('user_id', user.id).maybeSingle()
    const guardada = data?.clave_cipher ? decryptSecret(data.clave_cipher) : null
    if (guardada) clave = guardada
  }
  if (!clave.trim()) return NextResponse.json({ error: 'Ingresá tu clave fiscal' }, { status: 400 })
  // recordar: default true cuando llega una clave nueva; si es re-sync con la
  // guardada (no vino clave en el body), no la borramos.
  const claveEnBody = typeof raw.clave === 'string' && raw.clave.trim() !== ''
  const recordar = claveEnBody ? raw.recordar !== false : true

  // Arrancar la automation en Afip SDK.
  let job
  try {
    job = await iniciarMonotributo({ cuit, clave })
  } catch (e) {
    const err = e as AfipSdkError
    // 401 = nuestro AFIPSDK_TOKEN está mal (culpa nuestra) → 500; el resto 502.
    const status = err.status === 401 ? 500 : 502
    return NextResponse.json({ error: err.message || 'No se pudo consultar AFIP' }, { status })
  }

  // Guardar/actualizar la conexión (clave encriptada solo si el user lo pidió).
  let clave_cipher: string | null = null
  if (recordar) {
    try { clave_cipher = encryptSecret(clave) } catch { clave_cipher = null }
  }
  const conexion: Database['public']['Tables']['afip_conexion']['Insert'] = {
    user_id: user.id,
    cuit,
    metodo: 'clave_fiscal',
    estado: 'pendiente',
    sync_job_id: job.id ?? null,
    sync_error: null,
    clave_cipher,
  }
  await supabase.from('afip_conexion').upsert(conexion, { onConflict: 'user_id' })

  // ¿Vino completo de una? Procesar ya.
  if (!jobEnProceso(job.status)) {
    if (jobConError(job)) {
      const msg = mensajeErrorJob(job)
      await marcarErrorSync(supabase, user.id, msg)
      return NextResponse.json({ status: 'error', error: msg })
    }
    const sync = normalizarMonotributo(job.data)
    const { configActualizada } = await aplicarSync(supabase, user.id, sync)
    return NextResponse.json({ status: 'complete', data: sync, configActualizada })
  }

  return NextResponse.json({ status: 'in_process', jobId: job.id })
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let jobId = new URL(req.url).searchParams.get('jobId') ?? ''
  if (!jobId) {
    const { data } = await supabase
      .from('afip_conexion').select('sync_job_id').eq('user_id', user.id).maybeSingle()
    jobId = data?.sync_job_id ?? ''
  }
  if (!jobId) return NextResponse.json({ error: 'No hay una sincronización en curso' }, { status: 400 })

  let job
  try {
    job = await consultarJob(jobId)
  } catch (e) {
    return NextResponse.json({ error: (e as AfipSdkError).message || 'Error consultando AFIP' }, { status: 502 })
  }

  if (jobEnProceso(job.status)) return NextResponse.json({ status: 'in_process' })

  if (jobConError(job)) {
    const msg = mensajeErrorJob(job)
    await marcarErrorSync(supabase, user.id, msg)
    return NextResponse.json({ status: 'error', error: msg })
  }

  const sync = normalizarMonotributo(job.data)
  const { configActualizada } = await aplicarSync(supabase, user.id, sync)
  return NextResponse.json({ status: 'complete', data: sync, configActualizada })
}
