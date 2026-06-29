import { createClientForRequest } from '@/lib/supabase/route'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { validateISODate, isPlainObject } from '@/lib/validators'
import { debeDeferirFechas } from '@/lib/tarjeta-periodo'

// ─── POST /api/tarjetas/[id]/avanzar-ciclo ───────────────────────────────────
// Avanza las fechas de cierre/vencimiento de la tarjeta al PRÓXIMO ciclo,
// detectado al conciliar un resumen.
//
// Clave del fix: si el ciclo actual TODAVÍA NO venció, NO pisamos las fechas
// activas (eso reclasificaría compras del ciclo viejo y rompería la alerta de
// vencimiento). En su lugar guardamos las nuevas en columnas "pendientes" y el
// cron auto-conciliar las rota a las activas cuando pase el vencimiento.
//
// Si el ciclo ya venció (o la tarjeta no tenía fechas), aplicamos directo.
//
// Body: { proximo_cierre: ISO, proximo_vencimiento: ISO }
// Resp: { ok, deferred: bool, aplica_tras?: ISO (venc actual si deferred) }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!isPlainObject(body)) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const cierre = validateISODate(body.proximo_cierre, 'proximo_cierre')
  if (!cierre.ok) return NextResponse.json({ error: cierre.error }, { status: 400 })
  const venc = validateISODate(body.proximo_vencimiento, 'proximo_vencimiento')
  if (!venc.ok) return NextResponse.json({ error: venc.error }, { status: 400 })

  // Leer la tarjeta para conocer el vencimiento del ciclo actual.
  const { data: tarjeta, error: errSel } = await supabase
    .from('cuentas')
    .select('id, tipo_cuenta, fecha_vencimiento_tarjeta')
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)
    .maybeSingle()

  if (errSel)   return NextResponse.json({ error: errSel.message }, { status: 400 })
  if (!tarjeta) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 })

  const vencActual = (tarjeta as { fecha_vencimiento_tarjeta: string | null }).fecha_vencimiento_tarjeta
  const deferred   = debeDeferirFechas(vencActual)

  const update = deferred
    ? { fecha_cierre_pendiente: cierre.data, fecha_vencimiento_pendiente: venc.data }
    : {
        fecha_cierre_tarjeta:        cierre.data,
        fecha_vencimiento_tarjeta:   venc.data,
        // Al aplicar directo limpiamos cualquier pendiente viejo.
        fecha_cierre_pendiente:      null,
        fecha_vencimiento_pendiente: null,
      }

  const { error } = await supabase
    .from('cuentas')
    .update(update as never)
    .eq('id', id)
    .eq('tipo_cuenta', 'Tarjeta Credito')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/tarjetas')
  revalidatePath('/dashboard')

  return NextResponse.json({
    ok: true,
    deferred,
    aplica_tras: deferred ? vencActual : null,
  })
}
