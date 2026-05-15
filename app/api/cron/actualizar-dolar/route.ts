import { adminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'

// Cron diario: actualiza Dolar_Tarjeta_BNA en la tabla parametros
// para todos los usuarios, usando la cotización oficial del BNA.

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  // ── Obtener cotización del BNA ──────────────────────────────────────────────
  let valorNuevo: number
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    valorNuevo = Math.round(data.venta ?? data.compra)
    if (!valorNuevo || isNaN(valorNuevo)) throw new Error('Valor inválido')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: `No se pudo obtener cotización: ${message}` }, { status: 500 })
  }

  // ── Actualizar para todos los usuarios en una sola query ───────────────────
  // Antes hacíamos un UPDATE por user (N+1). Con muchos users es costoso.
  // Ahora un solo UPDATE matchea todas las filas con id=Dolar_Tarjeta_BNA;
  // el filtro por user_id se aplica como parte del where global, no por loop.
  const { count, error } = await adminClient
    .from('parametros')
    .update({ valor: valorNuevo }, { count: 'exact' })
    .eq('id', 'Dolar_Tarjeta_BNA')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`[actualizar-dolar] BNA = $${valorNuevo} | filas actualizadas: ${count ?? 0}`)

  return NextResponse.json({
    ok:                    true,
    valor:                 valorNuevo,
    usuarios_actualizados: count ?? 0,
  })
}
