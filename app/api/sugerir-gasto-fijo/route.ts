import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getCurrentWorkspace } from '@/lib/workspace'

// ─── GET /api/sugerir-gasto-fijo ──────────────────────────────────────────────
//
// Detecta si el usuario carga regularmente un gasto que sería conveniente
// convertir en gasto fijo. Heurística simple, sin IA:
//
//   1. Tomar el detalle y normalizarlo (lowercase, sacar acentos, sacar
//      sufijos típicos como "agosto 2026", "(Cuota 3/12)", etc).
//   2. Buscar movs previos con detalle ILIKE %normalizado% en los últimos
//      6 meses, monto en rango ±20% del actual.
//   3. Si hay ≥2 matches previos (es decir, contando el actual ya van 3 o
//      más) en meses distintos → sugerir gasto fijo.
//   4. La sugerencia incluye nombre propuesto (el detalle), monto promedio
//      y dia_vencimiento típico (moda del día del mes de los matches).
//
// Se llama DESPUÉS de un POST exitoso a /api/movimientos. Opt-in: el
// cliente lo llama si quiere; el flow principal no depende de esto.
//
// Query params: detalle, monto, cuenta_origen (opcional para acotar)
// Response: { suggestion: { nombre_sugerido, monto_promedio, dia_vencimiento, matches } } o { suggestion: null }

function normalizeDetalle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Sacar sufijos de cuotas
    .replace(/\(cuota\s*\d+\s*\/\s*\d+\)/gi, '')
    // Sacar meses + año explícitos
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s*\d{0,4}\b/gi, '')
    // Sacar números >= 2 dígitos al final (ej: "Edesur 25/08" → "Edesur")
    .replace(/\s+\d{2,}\s*$/g, '')
    // Sacar fechas tipo dd/mm
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const detalleRaw = (req.nextUrl.searchParams.get('detalle') ?? '').trim()
  const montoRaw   = parseFloat(req.nextUrl.searchParams.get('monto') ?? '0')
  if (!detalleRaw || detalleRaw.length < 3 || !Number.isFinite(montoRaw) || montoRaw <= 0) {
    return NextResponse.json({ suggestion: null })
  }

  const normalized = normalizeDetalle(detalleRaw)
  if (normalized.length < 3) {
    return NextResponse.json({ suggestion: null })
  }

  const workspace = await getCurrentWorkspace(user.id)

  // Buscar matches en los últimos 6 meses (180 días). Filtramos por detalle
  // ILIKE normalizado + monto en rango ±20% + no transferencia + no es ingreso.
  const seisMesesAtras = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const montoMin = montoRaw * 0.8
  const montoMax = montoRaw * 1.2
  // Escape de % y _ en LIKE
  const safeNorm = normalized.replace(/[%_]/g, '\\$&')

  const { data: matches, error } = await supabase
    .from('movimientos')
    .select('id, fecha, monto, detalle, categoria, subcategoria, cuenta_origen, moneda')
    .eq('user_id', workspace.ownerUserId)
    .eq('tipo_movimiento', 'Gasto')
    .gte('fecha', seisMesesAtras)
    .gte('monto', montoMin)
    .lte('monto', montoMax)
    .ilike('detalle', `%${safeNorm}%`)
    .order('fecha', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[sugerir-gasto-fijo] query error:', error)
    return NextResponse.json({ suggestion: null })
  }

  if (!matches || matches.length < 2) {
    // Necesitamos ≥2 matches PREVIOS para sugerir (con el actual son ≥3).
    return NextResponse.json({ suggestion: null })
  }

  // Verificar que los matches estén en MESES distintos (no son cuotas del
  // mismo mes ni rebotes).
  const mesesSet = new Set<string>()
  let sumaMonto = 0
  const diasMes: number[] = []
  let cuenta: string | null = null
  let categoria: string | null = null
  let subcategoria: string | null = null
  for (const m of matches) {
    const mesKey = (m.fecha ?? '').slice(0, 7)  // YYYY-MM
    mesesSet.add(mesKey)
    sumaMonto += Number(m.monto ?? 0)
    const dia = parseInt((m.fecha ?? '').slice(8, 10), 10)
    if (Number.isFinite(dia)) diasMes.push(dia)
    if (m.cuenta_origen)   cuenta = cuenta ?? m.cuenta_origen
    if (m.categoria)       categoria = categoria ?? m.categoria
    if (m.subcategoria)    subcategoria = subcategoria ?? m.subcategoria
  }
  if (mesesSet.size < 2) {
    // Todos los matches caen en el mismo mes → no es recurrente, es repeat
    // del mismo período.
    return NextResponse.json({ suggestion: null })
  }

  // Día típico: moda (más frecuente). Si empata, primero (más reciente).
  const dayCounts = new Map<number, number>()
  diasMes.forEach(d => dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1))
  let diaTipico = diasMes[0] ?? 1
  let maxCount = 0
  dayCounts.forEach((count, day) => {
    if (count > maxCount) { maxCount = count; diaTipico = day }
  })

  return NextResponse.json({
    suggestion: {
      nombre_sugerido: normalized.charAt(0).toUpperCase() + normalized.slice(1),
      monto_promedio:  Math.round((sumaMonto / matches.length) * 100) / 100,
      dia_vencimiento: diaTipico,
      cuenta_origen:   cuenta,
      categoria:       categoria,
      subcategoria:    subcategoria,
      moneda:          matches[0].moneda ?? 'ARS',
      matches:         matches.length,
      meses_distintos: mesesSet.size,
    },
  })
}
