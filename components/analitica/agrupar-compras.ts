// ─── Agrupador de compras en cuotas ──────────────────────────────────────────
//
// Las cuotas de una misma compra son N movimientos en la DB, pero conceptual-
// mente es UNA decisión de compra. Este helper las agrupa:
//
//   1. Si tienen `grupo_cuotas` definido → ése es el identificador del grupo
//      (lo más confiable, asignado al crear cuotas en bulk).
//   2. Fallback: agrupar por (detalle base, categoría, cuotas_total) cuando
//      la primera cuota no tiene grupo_cuotas asignado pero está marcada
//      como cuotas_total > 1.
//   3. Heurística extra: incluir movs con MISMO grupo_cuotas-base que tengan
//      cuotas_total=null pero pertenecen a la misma cuenta + categoría +
//      monto + fecha relativa (caso "primera cuota mal etiquetada").
//
// El montoTotal es la suma de los movs en el grupo. Para mostrar el monto
// "intencional" de la compra (e.g. mostrar $1.6M aunque sólo 4 cuotas caigan
// en el período), usamos `cuotaMonto × cuotasTotal` cuando los conocemos.

import { montoOf, type MovAnalitica } from './utils'

export type CompraAgrupada = {
  isCuota:            boolean
  representativo:     MovAnalitica
  detalle:            string
  montoTotal:         number              // total de la compra (intencional, no sólo lo del período)
  montoEnPeriodo:     number              // suma de los montos de los movs del grupo (= lo que cae en este recorte)
  fechaPrimera:       string
  cuotasTotal:        number
  cuotasEnPeriodo:    number
  cuotaMontoPromedio: number
}

function stripCuotaSuffix(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/\s*\(Cuota\s+\d+(?:\/\d+)?\)\s*$/i, '').trim()
}

export function agruparCompras(movs: MovAnalitica[]): CompraAgrupada[] {
  // Paso 1: agrupar por grupo_cuotas (los que tienen)
  const porGrupo: Record<string, MovAnalitica[]> = {}
  const sinGrupo: MovAnalitica[] = []

  for (const m of movs) {
    if (m.grupo_cuotas) {
      if (!porGrupo[m.grupo_cuotas]) porGrupo[m.grupo_cuotas] = []
      porGrupo[m.grupo_cuotas].push(m)
    } else {
      sinGrupo.push(m)
    }
  }

  // Paso 2: para los que NO tienen grupo_cuotas pero tienen cuotas_total > 1,
  // intentamos asociarlos a un grupo existente o crear un grupo fallback.
  // Estrategia: agrupar por (detalle normalizado, categoría, cuotas_total).
  // Una vez agrupados ahí, si hay un grupo en `porGrupo` con el mismo
  // detalle base + categoría, los mergeamos.
  const porHeur: Record<string, MovAnalitica[]> = {}
  const realmenteSueltos: MovAnalitica[] = []

  for (const m of sinGrupo) {
    if ((m.cuotas_total ?? 1) > 1) {
      const det = stripCuotaSuffix(m.detalle).toLowerCase()
      const cat = m.categoria_nombre ?? '__none__'
      const key = `${det}|${cat}|${m.cuotas_total}`
      if (!porHeur[key]) porHeur[key] = []
      porHeur[key].push(m)
    } else {
      // Posible "primera cuota mal etiquetada": cuotas_total = null/1, sin
      // grupo, pero con detalle base que matchea otro grupo existente.
      // Intentamos asociar después.
      realmenteSueltos.push(m)
    }
  }

  // Paso 3: merge heurístico — buscar movs "realmente sueltos" cuyo detalle
  // base + categoría matcheen con un grupo existente. Si matchea exactamente
  // 1 grupo, mergeamos el suelto ahí.
  const sueltosFinales: MovAnalitica[] = []
  for (const m of realmenteSueltos) {
    const det = stripCuotaSuffix(m.detalle).toLowerCase()
    const cat = m.categoria_nombre ?? '__none__'
    // Buscar grupos existentes con esta misma firma
    const candidatos: string[] = []

    // En porGrupo
    for (const [gid, gMovs] of Object.entries(porGrupo)) {
      const sample = gMovs[0]
      const sampleDet = stripCuotaSuffix(sample.detalle).toLowerCase()
      const sampleCat = sample.categoria_nombre ?? '__none__'
      if (sampleDet === det && sampleCat === cat) candidatos.push('grupo:' + gid)
    }
    // En porHeur
    for (const [hkey, hMovs] of Object.entries(porHeur)) {
      const sample = hMovs[0]
      const sampleDet = stripCuotaSuffix(sample.detalle).toLowerCase()
      const sampleCat = sample.categoria_nombre ?? '__none__'
      if (sampleDet === det && sampleCat === cat) candidatos.push('heur:' + hkey)
    }

    if (candidatos.length === 1) {
      const [tipo, id] = candidatos[0].split(/:(.+)/)
      if (tipo === 'grupo') porGrupo[id].push(m)
      else                  porHeur[id].push(m)
    } else {
      // Si no hay match único, queda como mov suelto
      sueltosFinales.push(m)
    }
  }

  // Paso 4: construir las CompraAgrupada
  const result: CompraAgrupada[] = []

  const procesarGrupo = (movsGroup: MovAnalitica[]) => {
    const sorted     = [...movsGroup].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const rep        = sorted[0]
    const sumaMovs   = movsGroup.reduce((a, m) => a + montoOf(m), 0)
    const cuotaProm  = sumaMovs / movsGroup.length
    // cuotasTotal = el MAX de cuotas_total entre los movs (algunos pueden tener null/1)
    const cuotasTotal = Math.max(...movsGroup.map(m => m.cuotas_total ?? 1), movsGroup.length)
    const montoIntencional = cuotaProm * cuotasTotal
    result.push({
      isCuota:            true,
      representativo:     rep,
      detalle:            stripCuotaSuffix(rep.detalle) || 'Sin detalle',
      montoTotal:         montoIntencional,
      montoEnPeriodo:     sumaMovs,
      fechaPrimera:       rep.fecha,
      cuotasTotal,
      cuotasEnPeriodo:    movsGroup.length,
      cuotaMontoPromedio: cuotaProm,
    })
  }

  for (const movsGroup of Object.values(porGrupo)) procesarGrupo(movsGroup)
  for (const movsGroup of Object.values(porHeur))  procesarGrupo(movsGroup)

  for (const m of sueltosFinales) {
    result.push({
      isCuota:            false,
      representativo:     m,
      detalle:            m.detalle ?? 'Sin detalle',
      montoTotal:         montoOf(m),
      montoEnPeriodo:     montoOf(m),
      fechaPrimera:       m.fecha,
      cuotasTotal:        1,
      cuotasEnPeriodo:    1,
      cuotaMontoPromedio: montoOf(m),
    })
  }

  return result.sort((a, b) => b.montoTotal - a.montoTotal)
}
