import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { parseAllEmails } from '@/lib/email-parsers'

// ─── Period + date helpers (mirrors cuenta-movimientos-table logic) ───────────
function calcularPeriodo(
  fechaStr: string,
  cierreDay: number | null,
  venceDay:  number | null,
  isTarjeta: boolean
): string {
  const d    = new Date(fechaStr + 'T12:00:00')
  let mes    = d.getMonth()
  let anio   = d.getFullYear()
  if (isTarjeta && cierreDay && venceDay) {
    const day = d.getDate()
    if (day <= cierreDay) {
      if (venceDay <= cierreDay) mes += 1
    } else {
      if (venceDay > cierreDay) mes += 1
      else                       mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function addMeses(fechaStr: string, n: number): string {
  const d = new Date(fechaStr + 'T12:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Verify shared secret to prevent unauthorized calls
  const secret = process.env.EMAIL_INBOUND_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = (await req.json()) as { texto: string; from?: string; subject?: string }
  const texto = body.texto?.trim() ?? ''

  if (!texto) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'empty body' })
  }

  // ── Parse email (supports single and digest emails with multiple transactions) ─
  const parsedList = parseAllEmails(texto)
  if (parsedList.length === 0) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'unrecognized format' })
  }

  // ── Load all active cuentas once ─────────────────────────────────────────────
  const { data: cuentas } = await adminClient
    .from('cuentas')
    .select('id, user_id, nombre_cuenta, tipo_cuenta, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta, terminacion_tarjeta')
    .eq('activa', true)

  // ── Process each parsed transaction ──────────────────────────────────────────
  const allRecords: object[] = []
  const importados: string[] = []
  const noMapeados: string[] = []

  for (const parsed of parsedList) {
    const cuenta = cuentas?.find(c => {
      if (!c.terminacion_tarjeta || !parsed.terminacion) return false
      return String(c.terminacion_tarjeta) === String(parsed.terminacion)
    })

    if (!cuenta) {
      console.warn(
        `[email-inbound] No cuenta found for terminacion=${parsed.terminacion} ` +
        `(${parsed.detalle} $${parsed.monto} ${parsed.moneda}). ` +
        `Configurá terminacion_tarjeta en la cuenta correspondiente.`
      )
      noMapeados.push(`terminacion ${parsed.terminacion}`)
      continue
    }

    const isTarjeta = cuenta.tipo_cuenta === 'Tarjeta Credito'
    const cierreDay = cuenta.fecha_cierre_tarjeta
      ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
    const venceDay  = cuenta.fecha_vencimiento_tarjeta
      ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
    const montoCuota = parsed.monto / parsed.cuotas

    const records = Array.from({ length: parsed.cuotas }, (_, i) => {
      const fechaCuota   = addMeses(parsed.fecha, i)
      const periodoCuota = calcularPeriodo(fechaCuota, cierreDay, venceDay, isTarjeta && parsed.moneda !== 'USD')
      return {
        id:              crypto.randomUUID(),
        fecha:           fechaCuota,
        detalle:         parsed.cuotas > 1
          ? `${parsed.detalle} (Cuota ${i + 1}/${parsed.cuotas})`
          : parsed.detalle,
        monto:           montoCuota,
        moneda:          parsed.moneda,
        tipo_movimiento: 'Gasto',
        cuenta_origen:   cuenta.id,
        cuenta_destino:  null,
        categoria:       null,
        subcategoria:    null,
        cotizacion:      null,
        conciliado:      false,
        periodo_tarjeta: periodoCuota,
        cuotas_total:    parsed.cuotas,
        cuota_actual:    i + 1,
        ciclo_actual:    1,
        user_id:         cuenta.user_id,
      }
    })

    allRecords.push(...records)
    importados.push(`${parsed.detalle} $${parsed.monto} → ${cuenta.nombre_cuenta}`)
  }

  if (allRecords.length === 0) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: `No cuenta configured for: ${noMapeados.join(', ')}`,
    })
  }

  // ── Insert all records into Supabase ─────────────────────────────────────────
  const { error } = await adminClient.from('movimientos').insert(allRecords)
  if (error) {
    console.error('[email-inbound] Insert error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`[email-inbound] ✓ Imported ${allRecords.length} record(s): ${importados.join(' | ')}`)
  return NextResponse.json({
    ok:         true,
    importados: importados.length,
    detalle:    importados[0] ?? '',
    monto:      parsedList[0]?.monto ?? 0,
    cuotas:     parsedList[0]?.cuotas ?? 1,
    cuenta:     importados[0]?.split(' → ')[1] ?? '',
  })
}
