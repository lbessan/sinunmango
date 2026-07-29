// ─── lib/resumen-checksum.ts ─────────────────────────────────────────────────
//
// Verifica que la extracción de un resumen esté COMPLETA comparándola contra los
// totales que el propio resumen declara. Así el sistema se controla solo, en vez
// de que el usuario tenga que revisar línea por línea.
//
// Chequeo principal — la ECUACIÓN DEL RESUMEN (sirve para cualquier banco):
//
//   saldo_anterior − pago + (consumos + impuestos − descuentos) = saldo_actual
//
// Si cierra, lo que extrajimos está completo. Si no, falta o sobra algo (típico:
// se colaron las "cuotas a vencer" o faltó un consumo). Verificado contra un
// resumen real de Galicia: 187.197,05 − 187.197,05 + 157.381,23 + 1.888,57 =
// 159.269,80 = saldo actual. ✓
//
// Todo en PESOS (ARS): los totales del encabezado son por moneda y los consumos
// en USD se manejan aparte; el checksum ARS es el que ataja los bugs de sumas.

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Totales de control que declara el resumen (los lee el modelo del encabezado). */
export type ControlResumen = {
  saldo_anterior?: number | null
  su_pago?:        number | null   // "Su pago en pesos", valor positivo (lo devuelve el modelo)
  pago?:           number | null   // alias — algunos callers/tests usan este nombre
  saldo_actual?:   number | null
  total_consumos?: number | null   // "Total consumos" (chequeo secundario)
}

export type Verificacion = {
  aplicable:            boolean   // false si el resumen no declaró totales para chequear
  cuadra:               boolean
  sumaConsumos:         number
  sumaImpuestos:        number
  sumaDescuentos:       number
  esperadoSaldoActual:  number | null
  diferencia:           number | null   // esperado − declarado (0 = cuadra)
  mensaje:              string
}

const TOL = 1  // 1 peso — absorbe redondeos

/**
 * Compara lo extraído (transacciones) contra los totales declarados. No corta el
 * flujo: devuelve el veredicto para que la UI muestre un cartel verde/ámbar.
 */
export function verificarResumen(items: readonly unknown[], control: ControlResumen): Verificacion {
  let sumaConsumos = 0, sumaImpuestos = 0, sumaDescuentos = 0
  for (const it of items) {
    if (typeof it !== 'object' || it === null) continue
    const i = it as { monto_ars?: unknown; es_impuesto?: unknown; es_descuento?: unknown }
    const m = num(i.monto_ars)
    if (m === null) continue          // USD u otra moneda → fuera del checksum ARS
    const val = Math.abs(m)
    if (i.es_impuesto)       sumaImpuestos  += val
    else if (i.es_descuento) sumaDescuentos += val
    else                     sumaConsumos   += val
  }
  const neto = sumaConsumos + sumaImpuestos - sumaDescuentos

  const base = {
    sumaConsumos:  round2(sumaConsumos),
    sumaImpuestos: round2(sumaImpuestos),
    sumaDescuentos: round2(sumaDescuentos),
  }

  const sa   = num(control.saldo_anterior)
  const pago = num(control.su_pago ?? control.pago)
  const sact = num(control.saldo_actual)

  // Chequeo principal: la ecuación del resumen.
  if (sa !== null && pago !== null && sact !== null) {
    const esperado   = round2(sa - Math.abs(pago) + neto)
    const diferencia = round2(esperado - sact)
    const cuadra     = Math.abs(diferencia) <= TOL
    return {
      ...base, aplicable: true, cuadra,
      esperadoSaldoActual: esperado, diferencia,
      mensaje: cuadra
        ? `Cuadra con el resumen (saldo actual $${fmt(sact)}).`
        : `No cuadra por $${fmt(Math.abs(diferencia))}: lo que extraje da un saldo de $${fmt(esperado)} pero el resumen dice $${fmt(sact)}. Revisá si falta o sobra algún consumo.`,
    }
  }

  // Fallback: chequeo contra el "Total consumos" si el resumen lo declaró.
  const tc = num(control.total_consumos)
  if (tc !== null) {
    const diferencia = round2(sumaConsumos - tc)
    const cuadra     = Math.abs(diferencia) <= TOL
    return {
      ...base, aplicable: true, cuadra,
      esperadoSaldoActual: null, diferencia,
      mensaje: cuadra
        ? `Los consumos cuadran con el total del resumen ($${fmt(tc)}).`
        : `No cuadra: sumé $${fmt(sumaConsumos)} en consumos pero el resumen dice $${fmt(tc)}.`,
    }
  }

  return {
    ...base, aplicable: false, cuadra: false,
    esperadoSaldoActual: null, diferencia: null,
    mensaje: 'No pude verificar automáticamente (el resumen no declaró sus totales).',
  }
}
