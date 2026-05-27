import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { getCurrentWorkspace } from '@/lib/workspace'

// ─── GET /api/sugerir-categoria ───────────────────────────────────────────────
//
// Dado un detalle de movimiento (ej: "Netflix" o "Edesur agosto"), sugiere
// categoría + subcategoría basándose en movimientos previos del mismo
// workspace que tengan detalle similar.
//
// Es la primera capa de auto-categorización — gratis (sin IA), funciona en
// el 80% de los casos con datos del propio user. Una capa futura sumará
// fallback a Claude cuando no hay historial (Pro-only).
//
// Estrategia:
//   1. Tokenizar el detalle (split por espacios, normalizar lowercase, sacar
//      stopwords cortas como "de", "la", "en", "el").
//   2. Buscar en movimientos previos donde el detalle contiene CUALQUIERA de
//      los tokens (ILIKE %token%), excluyendo transferencias.
//   3. Contar por (categoria, subcategoria) y devolver la combinación más
//      frecuente. Confianza:
//        - alta:   ≥3 matches con la misma categoría
//        - media:  2 matches
//        - baja:   1 match (no se devuelve — UX no vale para 1 dato)
//   4. Si no hay matches, 200 con sugerencia null.
//
// Query params:
//   - detalle: string (mín 2 chars)
//
// Response:
//   { suggestion: { categoria_id, categoria_nombre, subcategoria_id?, subcategoria_nombre?, confidence: 'alta'|'media', matches: N } }
//   o { suggestion: null } si no hay info suficiente.

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'a', 'al', 'y', 'o',
  'un', 'una', 'unos', 'unas', 'con', 'por', 'para', 'sin', 'mi',
  '$', 'ars', 'usd', 'eur',
])

function tokenize(detalle: string): string[] {
  return detalle
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sacar acentos
    .replace(/[^\w\s]/g, ' ')                            // sin puntuación
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const detalleRaw = (req.nextUrl.searchParams.get('detalle') ?? '').trim()
  if (detalleRaw.length < 2) {
    return NextResponse.json({ suggestion: null })
  }

  const tokens = tokenize(detalleRaw)
  if (tokens.length === 0) {
    return NextResponse.json({ suggestion: null })
  }

  // Scoping: usamos el workspace activo (el invitee ve datos del owner).
  const workspace = await getCurrentWorkspace(user.id)

  // Construir OR de ILIKE para cada token. Limitamos a 5 tokens para no
  // armar queries gigantes.
  const orClauses = tokens.slice(0, 5)
    .map(t => `detalle.ilike.%${t.replace(/[%_]/g, '\\$&')}%`)
    .join(',')

  // Pedimos los últimos 200 movimientos que matcheen — más que suficiente
  // para detectar el patrón. Ordenados por fecha desc para priorizar lo
  // reciente (si el user cambió Netflix de "Entretenimiento" a "Suscripciones",
  // gana la más reciente al desempatar).
  const { data: matches, error } = await supabase
    .from('movimientos')
    .select('categoria, subcategoria, fecha')
    .eq('user_id', workspace.ownerUserId)
    .neq('tipo_movimiento', 'Transferencia')
    .not('categoria', 'is', null)
    .or(orClauses)
    .order('fecha', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[sugerir-categoria] query error:', error)
    return NextResponse.json({ suggestion: null })
  }

  if (!matches || matches.length === 0) {
    return NextResponse.json({ suggestion: null })
  }

  // Agrupar por (categoria, subcategoria) y contar.
  const buckets = new Map<string, { categoria: string; subcategoria: string | null; count: number }>()
  for (const m of matches) {
    if (!m.categoria) continue
    const key = `${m.categoria}::${m.subcategoria ?? ''}`
    const b = buckets.get(key)
    if (b) {
      b.count++
    } else {
      buckets.set(key, { categoria: m.categoria, subcategoria: m.subcategoria, count: 1 })
    }
  }

  // Tomamos el bucket con más matches. En caso de empate, el más reciente
  // gana porque ya está ordenado desc por fecha (el primer match insertado
  // queda en el bucket más grande con count incrementando).
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
  const top = sorted[0]
  if (!top || top.count < 2) {
    // 1 match no es suficiente para sugerir — UX malo dar predicciones desde
    // un único dato. Si pasa a 2+, ya empieza a tener señal.
    return NextResponse.json({ suggestion: null })
  }

  // Levantar nombres legibles de categoría/subcategoría
  const [catRow, subRow] = await Promise.all([
    supabase.from('categorias').select('id, nombre_categoria').eq('id', top.categoria).maybeSingle(),
    top.subcategoria
      ? supabase.from('subcategorias').select('id, nombre_subcategoria').eq('id', top.subcategoria).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  return NextResponse.json({
    suggestion: {
      categoria_id:        top.categoria,
      categoria_nombre:    catRow.data?.nombre_categoria ?? null,
      subcategoria_id:     top.subcategoria,
      subcategoria_nombre: subRow.data?.nombre_subcategoria ?? null,
      confidence:          top.count >= 3 ? 'alta' : 'media',
      matches:             top.count,
    },
  })
}
