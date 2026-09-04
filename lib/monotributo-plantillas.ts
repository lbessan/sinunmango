// ─── lib/monotributo-plantillas.ts ───────────────────────────────────────────
//
// Plantillas de las facturas que se repiten todos los meses. La plantilla
// guarda lo que NO cambia (cliente, conceptos, importes de referencia) y acá
// resolvemos lo que SÍ cambia en cada emisión: el período facturado, el
// vencimiento de pago y el mes/año que va escrito en las descripciones.
//
// Fechas: todo se calcula sobre strings YYYY-MM-DD con aritmética propia. Nada
// de `new Date(iso)` + toISOString(), que corre un día según el huso.

export type ItemPlantilla = { descripcion: string; cantidad: number; precio: number }

export type PeriodoModo = 'mes_actual' | 'mes_anterior' | 'dia_emision'

export type Plantilla = {
  id:             string
  nombre:         string
  cliente_nombre: string | null
  doc_tipo:       number | null
  doc_nro:        string | null
  condicion_iva:  number | null
  concepto:       number
  pto_vta:        number | null
  items:          ItemPlantilla[]
  periodo_modo:   PeriodoModo
  dias_vto_pago:  number
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

const partes = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}
const pad = (n: number) => String(n).padStart(2, '0')
const armar = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Último día del mes (1-12). Usa UTC para que no lo corra el huso. */
export function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/** Suma días a una fecha ISO, sin pasar por el huso local. */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = partes(iso)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + dias)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/**
 * Período facturado según el modo de la plantilla.
 *   mes_actual   → todo el mes en el que se emite (facturás el mes que cierra)
 *   mes_anterior → todo el mes pasado (facturás a mes vencido)
 *   dia_emision  → solo el día (cargos puntuales, reintegros)
 */
export function resolverPeriodo(modo: PeriodoModo, hoyISO: string): { desde: string; hasta: string } {
  const [y, m, d] = partes(hoyISO)
  if (modo === 'dia_emision') return { desde: hoyISO, hasta: hoyISO }
  const mesTarget = modo === 'mes_anterior' ? m - 1 : m
  // Normalizamos el corrimiento de año (enero - 1 → diciembre del año anterior).
  const anio = mesTarget < 1 ? y - 1 : mesTarget > 12 ? y + 1 : y
  const mes  = mesTarget < 1 ? mesTarget + 12 : mesTarget > 12 ? mesTarget - 12 : mesTarget
  void d
  return { desde: armar(anio, mes, 1), hasta: armar(anio, mes, ultimoDiaMes(anio, mes)) }
}

/**
 * Reemplaza {mes} y {anio} por los del período facturado — NO por los de hoy:
 * una factura emitida el 3 de septiembre por el mes de agosto tiene que decir
 * "Agosto 2026". Acepta {MES} en mayúsculas y {año} con ñ.
 */
export function resolverPlaceholders(texto: string, periodoDesde: string): string {
  const [anio, mes] = partes(periodoDesde)
  const nombreMes = MESES[mes - 1] ?? ''
  return texto
    .replace(/\{mes\}/gi, nombreMes)
    .replace(/\{(anio|año)\}/gi, String(anio))
}

export type FacturaArmada = {
  concepto:      number
  clienteNombre: string
  docTipo:       number
  docNro:        string
  condIva:       number
  ptoVta:        number | null
  items:         ItemPlantilla[]
  periodoDesde:  string
  periodoHasta:  string
  vtoPago:       string
}

/** Aplica la plantilla a una fecha de emisión: deja la factura lista para editar. */
export function aplicarPlantilla(p: Plantilla, hoyISO: string): FacturaArmada {
  const { desde, hasta } = resolverPeriodo(p.periodo_modo, hoyISO)
  return {
    concepto:      p.concepto,
    clienteNombre: p.cliente_nombre ?? '',
    docTipo:       p.doc_tipo ?? 80,
    docNro:        p.doc_nro ?? '',
    condIva:       p.condicion_iva ?? 1,
    ptoVta:        p.pto_vta,
    items: p.items.map(it => ({
      ...it,
      descripcion: resolverPlaceholders(it.descripcion, desde),
    })),
    periodoDesde: desde,
    periodoHasta: hasta,
    // El vencimiento se cuenta desde la emisión, no desde el fin del período.
    vtoPago: sumarDias(hoyISO, p.dias_vto_pago),
  }
}

/** Total de referencia de la plantilla (lo que saldría sin tocar importes). */
export function totalPlantilla(items: ItemPlantilla[]): number {
  return items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio) || 0), 0)
}

/** Normaliza items venidos del cliente/DB, descartando basura. */
export function normalizarItems(raw: unknown): ItemPlantilla[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(it => {
      const o = (it ?? {}) as Record<string, unknown>
      return {
        descripcion: String(o.descripcion ?? '').slice(0, 200),
        cantidad:    Number(o.cantidad) || 0,
        precio:      Number(o.precio) || 0,
      }
    })
    .filter(it => it.descripcion.trim().length > 0 || it.precio > 0)
}
