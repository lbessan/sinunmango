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
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    valorNuevo = Math.round(data.venta ?? data.compra)
    if (!valorNuevo || isNaN(valorNuevo)) throw new Error('Valor inválido')
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `No se pudo obtener cotización: ${err.message}` }, { status: 500 })
  }

  // ── Actualizar para todos los usuarios en parametros ────────────────────────
  const { data: usuarios } = await adminClient
    .from('parametros')
    .select('user_id')
    .eq('id', 'Dolar_Tarjeta_BNA')

  const userIds = [...new Set((usuarios ?? []).map(u => u.user_id).filter((v): v is string => !!v))]

  let actualizados = 0
  for (const userId of userIds) {
    const { error } = await adminClient
      .from('parametros')
      .update({ valor: valorNuevo })
      .eq('id', 'Dolar_Tarjeta_BNA')
      .eq('user_id', userId)

    if (!error) actualizados++
  }

  console.log(`[actualizar-dolar] BNA = $${valorNuevo} | actualizados: ${actualizados} usuario(s)`)

  return NextResponse.json({
    ok: true,
    valor: valorNuevo,
        usuarios_actualizados: actualizados,
  })
}
