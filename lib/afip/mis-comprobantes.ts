// ─── lib/afip/mis-comprobantes.ts ────────────────────────────────────────────
//
// Parser del export de "Mis Comprobantes" (ARCA → Comprobantes emitidos →
// Descargar CSV).
//
// POR QUÉ EXISTE: wsfe (el web service de facturación) SOLO conoce los
// comprobantes que autorizó el propio wsfe. Los que emitís desde "Comprobantes
// en línea" viven en otro subsistema, con otro punto de venta, y NO se pueden
// leer con el certificado — FECompUltimoAutorizado devuelve 0 para todos.
// La única forma de traerlos sin entregar usuario+clave fiscal a un tercero es
// este CSV, que ARCA deja bajar sin restricciones.
//
// El parser es deliberadamente tolerante: ARCA cambió el separador y los
// nombres de columna varias veces (y Excel los re-escribe al abrir el archivo).
// Matcheamos por nombre normalizado (sin acentos, sin puntos, minúsculas) y
// aceptamos varias variantes por campo.

/** Una fila del export, ya normalizada. */
export type FilaComprobante = {
  fecha:              string   // ISO YYYY-MM-DD
  tipo:               number | null
  tipoLabel:          string
  puntoVenta:         string   // "00001"
  numero:             string   // "00000110"
  numeroComprobante:  string   // "00001-00000110"
  cae:                string | null
  clienteDoc:         string | null
  cliente:            string
  moneda:             string
  /** Total del comprobante. NEGATIVO en notas de crédito (restan facturación). */
  total:              number
  esNotaCredito:      boolean
}

export type ResultadoParseo = {
  filas:      FilaComprobante[]
  /** Filas que no pudimos interpretar, con el motivo (para mostrarlas). */
  descartadas: { linea: number; motivo: string }[]
  /** Columnas que encontramos — sirve para diagnosticar un formato nuevo. */
  columnas:   string[]
}

// ── Utilidades de texto ──────────────────────────────────────────────────────

/** "Imp. Total" → "imp total" — sin acentos, sin puntuación, colapsado. */
export function normalizarHeader(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[."'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Detecta el separador mirando la primera línea (ARCA usa ';', Excel a veces ','). */
export function detectarSeparador(primeraLinea: string): string {
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length
  const coma       = (primeraLinea.match(/,/g) ?? []).length
  const tab        = (primeraLinea.match(/\t/g) ?? []).length
  if (tab > puntoYComa && tab > coma) return '\t'
  return puntoYComa >= coma ? ';' : ','
}

/** Split de una línea CSV respetando comillas dobles. */
export function splitCsvLine(linea: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') { cur += '"'; i++ }  // "" escapado
      else enComillas = !enComillas
    } else if (ch === sep && !enComillas) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/**
 * Número en formato AR o US. "101.000,00" → 101000 | "101000.00" → 101000.
 * Regla: manda el ÚLTIMO separador que aparezca (es el decimal).
 */
export function parseNumero(raw: string): number | null {
  const s = (raw ?? '').replace(/\s|\$/g, '').trim()
  if (!s) return null
  const ultimaComa  = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')
  let limpio: string
  if (ultimaComa > ultimoPunto) {
    limpio = s.replace(/\./g, '').replace(',', '.')      // AR: 101.000,00
  } else if (ultimoPunto > ultimaComa) {
    limpio = s.replace(/,/g, '')                          // US: 101,000.00
  } else {
    limpio = s.replace(/[.,]/g, '')                       // sin decimales
  }
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** "15/07/2026" | "2026-07-15" | "20260715" → "2026-07-15". */
export function parseFecha(raw: string): string | null {
  const s = (raw ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// ── Mapeo de columnas ────────────────────────────────────────────────────────
// Cada campo lista las variantes que vimos/documenta ARCA. Se matchea por
// "empieza con" sobre el header normalizado, así "imp total" matchea
// "imp total" y "imp total ars".
const COLUMNAS: Record<string, string[]> = {
  fecha:      ['fecha de emision', 'fecha emision', 'fecha'],
  tipo:       ['tipo de comprobante', 'tipo comprobante', 'tipo'],
  puntoVenta: ['punto de venta', 'punto venta', 'pto venta'],
  numeroDesde:['numero desde', 'nro desde', 'numero'],
  cae:        ['cod autorizacion', 'codigo de autorizacion', 'cae'],
  docNro:     ['nro doc receptor', 'nro documento receptor', 'numero doc receptor', 'nro doc'],
  cliente:    ['denominacion receptor', 'denominacion del receptor', 'receptor', 'denominacion'],
  moneda:     ['moneda'],
  total:      ['imp total', 'importe total', 'total'],
}

/** Devuelve el índice de cada campo lógico dentro del header del CSV. */
export function mapearColumnas(headers: string[]): Record<string, number> {
  const norm = headers.map(normalizarHeader)
  const idx: Record<string, number> = {}
  for (const [campo, variantes] of Object.entries(COLUMNAS)) {
    for (const v of variantes) {
      const i = norm.findIndex(h => h === v)
      if (i >= 0) { idx[campo] = i; break }
    }
    if (idx[campo] === undefined) {
      // Segunda pasada, más laxa: "empieza con".
      for (const v of variantes) {
        const i = norm.findIndex(h => h.startsWith(v))
        if (i >= 0) { idx[campo] = i; break }
      }
    }
  }
  return idx
}

/** Código de comprobante y si resta (nota de crédito). */
export function interpretarTipo(raw: string): { codigo: number | null; esNotaCredito: boolean; label: string } {
  const s = (raw ?? '').trim()
  const label = s || '—'
  // "13 - Nota de Crédito C" | "13" | "Nota de Crédito C"
  const codigo = Number(s.match(/^\s*(\d{1,3})/)?.[1] ?? NaN)
  const norm = normalizarHeader(s)
  // Los códigos de nota de crédito: 3 (A), 8 (B), 13 (C), 53, 110, 112-115, 119, 203...
  const CODIGOS_NC = new Set([3, 8, 13, 21, 41, 53, 110, 112, 113, 114, 119, 203, 208, 213])
  const esNotaCredito = /nota de credito|notas de credito|^nc /.test(norm)
    || (Number.isFinite(codigo) && CODIGOS_NC.has(codigo))
  return { codigo: Number.isFinite(codigo) ? codigo : null, esNotaCredito, label }
}

const pad = (s: string, n: number) => s.replace(/\D/g, '').padStart(n, '0')

/**
 * Parsea el CSV de "Mis Comprobantes — Emitidos".
 * No tira: lo que no entiende va a `descartadas` para que la UI lo muestre.
 */
export function parseMisComprobantes(texto: string): ResultadoParseo {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lineas.length === 0) return { filas: [], descartadas: [], columnas: [] }

  const sep = detectarSeparador(lineas[0])
  const headers = splitCsvLine(lineas[0], sep)
  const idx = mapearColumnas(headers)

  const faltantes = ['fecha', 'total'].filter(c => idx[c] === undefined)
  if (faltantes.length > 0) {
    return {
      filas: [],
      descartadas: [{ linea: 1, motivo: `No reconocimos el formato: falta la columna de ${faltantes.join(' y ')}. Columnas encontradas: ${headers.join(', ')}` }],
      columnas: headers,
    }
  }

  const filas: FilaComprobante[] = []
  const descartadas: { linea: number; motivo: string }[] = []

  for (let i = 1; i < lineas.length; i++) {
    const cols = splitCsvLine(lineas[i], sep)
    const get = (campo: string): string => (idx[campo] !== undefined ? (cols[idx[campo]] ?? '') : '')

    const fecha = parseFecha(get('fecha'))
    const total = parseNumero(get('total'))
    if (!fecha || total === null) {
      // Las últimas líneas del export suelen ser totales/pie — no son error.
      descartadas.push({ linea: i + 1, motivo: !fecha ? 'sin fecha válida' : 'sin importe válido' })
      continue
    }

    const { codigo, esNotaCredito, label } = interpretarTipo(get('tipo'))
    const puntoVenta = pad(get('puntoVenta') || '0', 5)
    const numero = pad(get('numeroDesde') || '0', 8)
    const cae = get('cae').replace(/\D/g, '') || null
    // Consumidor final viaja como documento 0 (o vacío): no es un documento.
    const docLimpio = get('docNro').replace(/\D/g, '')
    const docNro = docLimpio && !/^0+$/.test(docLimpio) ? docLimpio : null
    const clienteRaw = get('cliente').trim()

    filas.push({
      fecha,
      tipo: codigo,
      tipoLabel: label,
      puntoVenta,
      numero,
      numeroComprobante: `${puntoVenta}-${numero}`,
      cae,
      clienteDoc: docNro,
      cliente: clienteRaw || (docNro ? `Doc ${docNro}` : 'Consumidor final'),
      moneda: (get('moneda') || 'PES').trim().toUpperCase(),
      // Una NC resta: la guardamos negativa para que las sumas del gauge y de
      // la proyección den lo mismo que calcula ARCA.
      total: esNotaCredito ? -Math.abs(total) : Math.abs(total),
      esNotaCredito,
    })
  }

  return { filas, descartadas, columnas: headers }
}
