// ─── lib/gastos-fijos-vinculo.ts ─────────────────────────────────────────────
//
// Matcher movimiento ↔ gasto fijo. El link persistente (movimientos.gasto_fijo_id)
// es lo que permite que las proyecciones resten un gasto fijo SOLO cuando su
// consumo todavía no entró como movimiento en ese período (sin el link, se
// restaban los dos: doble conteo).
//
// Cómo se puebla el link:
//   1. Manual: el formulario de edición tiene un selector "Gasto fijo".
//   2. Automático (cron diario): este matcher, con dos reglas CONSERVADORAS:
//      - HISTORIAL: si el detalle normalizado del movimiento coincide con el de
//        un movimiento ya vinculado a ese gasto fijo (en cualquier período),
//        se vincula. Es la señal fuerte: "Camuzzi" siempre factura "CAMUZZI...".
//      - SEMILLA: si no hay historial, se vincula solo un match INEQUÍVOCO:
//        misma cuenta (si el gasto fijo declara cuenta), misma moneda, monto
//        dentro de ±25% del estimado, y la relación es 1 a 1 (un solo candidato
//        para ese gasto fijo Y un solo gasto fijo reclamando ese movimiento).
//      Ante ambigüedad no vincula nada — un link errado es peor que uno faltante
//      (el usuario puede vincular a mano desde el form).

export type MovParaVincular = {
  id:              string
  detalle:         string | null
  monto:           number
  moneda:          string | null
  cuenta_origen:   string | null
  tipo_movimiento: string | null
  gasto_fijo_id:   string | null
}

export type GastoFijoParaVincular = {
  id:                  string
  nombre_gasto:        string
  monto_estimado:      number
  moneda:              string
  cuenta_pago_default: string | null
}

/** "BIND*EDEA S.A. 123" → "bind edea sa" — sin números, símbolos ni acentos. */
export function normalizarDetalle(detalle: string | null | undefined): string {
  return (detalle ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TOLERANCIA_MONTO = 0.25  // ±25% del estimado (las facturas varían mes a mes)

function montoCompatible(monto: number, estimado: number): boolean {
  if (!(estimado > 0)) return false
  return Math.abs(monto - estimado) <= estimado * TOLERANCIA_MONTO
}

/**
 * Propone vínculos para los movimientos de un período.
 *
 * @param movs        movimientos del período (Gasto, sin vincular todavía incluidos los ya vinculados — los vinculados solo marcan el gasto fijo como "tomado")
 * @param gastosFijos gastos fijos activos
 * @param historial   detalles normalizados ya vinculados, por gasto_fijo_id
 * @returns pares { movId, gastoFijoId } — nunca más de un mov por gasto fijo
 */
export function proponerVinculos(
  movs:        ReadonlyArray<MovParaVincular>,
  gastosFijos: ReadonlyArray<GastoFijoParaVincular>,
  historial:   ReadonlyMap<string, ReadonlySet<string>>,
): Array<{ movId: string; gastoFijoId: string }> {
  const out: Array<{ movId: string; gastoFijoId: string }> = []
  const movsTomados = new Set<string>()

  // Gastos fijos que YA tienen un mov vinculado en este período: no se re-vinculan.
  const gfTomados = new Set(
    movs.filter(m => m.gasto_fijo_id).map(m => m.gasto_fijo_id as string),
  )
  for (const m of movs) if (m.gasto_fijo_id) movsTomados.add(m.id)

  const candidatos = movs.filter(m => m.tipo_movimiento === 'Gasto' && !m.gasto_fijo_id)

  // ── Regla 1: historial de detalles ──
  for (const gf of gastosFijos) {
    if (gfTomados.has(gf.id)) continue
    const conocidos = historial.get(gf.id)
    if (!conocidos || conocidos.size === 0) continue
    const match = candidatos.find(m =>
      !movsTomados.has(m.id) && conocidos.has(normalizarDetalle(m.detalle)),
    )
    if (match) {
      out.push({ movId: match.id, gastoFijoId: gf.id })
      movsTomados.add(match.id)
      gfTomados.add(gf.id)
    }
  }

  // ── Regla 2: semilla inequívoca (1 a 1) ──
  const sinHistorial = gastosFijos.filter(gf =>
    !gfTomados.has(gf.id) && !(historial.get(gf.id)?.size),
  )
  // candidatos por gasto fijo
  const porGf = new Map<string, MovParaVincular[]>()
  // gastos fijos que reclaman cada mov
  const reclamos = new Map<string, string[]>()

  for (const gf of sinHistorial) {
    const cands = candidatos.filter(m =>
      !movsTomados.has(m.id)
      && (m.moneda ?? 'ARS') === gf.moneda
      && (!gf.cuenta_pago_default || m.cuenta_origen === gf.cuenta_pago_default)
      && montoCompatible(m.monto, gf.monto_estimado),
    )
    porGf.set(gf.id, cands)
    for (const c of cands) {
      reclamos.set(c.id, [...(reclamos.get(c.id) ?? []), gf.id])
    }
  }

  for (const gf of sinHistorial) {
    const cands = (porGf.get(gf.id) ?? []).filter(m => !movsTomados.has(m.id))
    if (cands.length !== 1) continue                      // ambiguo → no vincular
    const unico = cands[0]
    if ((reclamos.get(unico.id) ?? []).length !== 1) continue  // dos gf lo quieren → no
    out.push({ movId: unico.id, gastoFijoId: gf.id })
    movsTomados.add(unico.id)
    gfTomados.add(gf.id)
  }

  return out
}
