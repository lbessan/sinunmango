// ─── Helpers de Monotributo ──────────────────────────────────────────────────
// Cálculos puros (sin side effects ni acceso a DB) para usar en el dashboard,
// el cron de alertas y los tests. No incluyen tabla hardcoded de categorías
// porque el user actualiza los valores manualmente en cada semestre.

export type FacturaEmitida = {
  id:        string
  fecha:     string   // 'YYYY-MM-DD'
  cliente:   string
  monto:     number
  concepto?: string | null
}

export type MonotributoConfig = {
  categoria:                string
  limite_facturacion_anual: number
  costo_mensual:            number
  actividad:                'servicios' | 'venta_bienes'
}

export type GaugeStatus = 'ok' | 'warning' | 'danger'

// ─── 1) Facturación acumulada de los últimos 12 meses móviles ────────────────
// AFIP/ARCA evalúa el límite sobre los últimos 12 meses, no el año calendario.
export function facturacionUltimos12Meses(
  facturas: FacturaEmitida[],
  hoy:      Date = new Date(),
): number {
  const desde = new Date(hoy)
  desde.setFullYear(desde.getFullYear() - 1)
  return facturas
    .filter(f => new Date(f.fecha + 'T12:00:00') >= desde)
    .reduce((acc, f) => acc + f.monto, 0)
}

// ─── 2) Status del gauge (verde / amarillo / rojo) ───────────────────────────
//   - ok     : < 80%
//   - warning: 80% - 95%
//   - danger : >= 95%
export function gaugeStatus(facturado: number, limite: number): GaugeStatus {
  if (limite <= 0) return 'ok'
  const pct = (facturado / limite) * 100
  if (pct >= 95) return 'danger'
  if (pct >= 80) return 'warning'
  return 'ok'
}

// ─── 3) Proyección "te recategorizás en X meses" ─────────────────────────────
// Toma el promedio de facturación mensual de los últimos N meses (default 3)
// y calcula cuántos meses faltan para alcanzar el límite proyectando ese ritmo.
// Devuelve null si no hay datos suficientes o el promedio es 0.
export function proyeccionMesesHastaLimite(
  facturas:    FacturaEmitida[],
  limite:      number,
  facturado12: number,
  hoy:         Date = new Date(),
  mesesPromedio = 3,
): number | null {
  if (limite <= 0) return null
  const restante = limite - facturado12
  if (restante <= 0) return 0  // ya pasaste el límite

  // Promedio de los últimos N meses calendar.
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - mesesPromedio + 1, 1)
  const totalReciente = facturas
    .filter(f => new Date(f.fecha + 'T12:00:00') >= inicio)
    .reduce((acc, f) => acc + f.monto, 0)
  if (totalReciente <= 0) return null
  const promedioMensual = totalReciente / mesesPromedio

  return Math.ceil(restante / promedioMensual)
}

// ─── 4) Facturación agrupada por mes (para gráficos) ─────────────────────────
export type MesFacturacion = { mes: string; label: string; total: number }

export function facturacionPorMes(
  facturas: FacturaEmitida[],
  cantMeses = 12,
  hoy:      Date = new Date(),
): MesFacturacion[] {
  const meses: MesFacturacion[] = []
  for (let i = cantMeses - 1; i >= 0; i--) {
    const d   = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    meses.push({
      mes:   key,
      label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', ''),
      total: 0,
    })
  }
  const idx: Record<string, number> = {}
  meses.forEach((m, i) => { idx[m.mes] = i })
  facturas.forEach(f => {
    const key = f.fecha.slice(0, 7)
    if (idx[key] !== undefined) meses[idx[key]].total += f.monto
  })
  return meses
}

// ─── 5) Agrupar por cliente para comparador ──────────────────────────────────
export type FacturasPorCliente = {
  cliente:     string
  total:       number
  count:       number
  ultimaFecha: string
}

export function facturasAgrupadasPorCliente(facturas: FacturaEmitida[]): FacturasPorCliente[] {
  const map: Record<string, FacturasPorCliente> = {}
  facturas.forEach(f => {
    const cliente = f.cliente.trim()
    if (!cliente) return
    const key = cliente.toLowerCase()
    if (!map[key]) {
      map[key] = { cliente, total: 0, count: 0, ultimaFecha: f.fecha }
    }
    map[key].total += f.monto
    map[key].count++
    if (f.fecha > map[key].ultimaFecha) map[key].ultimaFecha = f.fecha
  })
  return Object.values(map).sort((a, b) => b.total - a.total)
}

// ─── 6) Próxima recategorización ─────────────────────────────────────────────
// El monotributo se recategoriza 2 veces al año: ENERO y JULIO. El plazo
// suele cerrar alrededor del día 20 (AFIP define la fecha exacta cada año;
// usamos el 20 como referencia estable). Devolvemos la próxima fecha futura.
export type Recategorizacion = {
  fecha:         string        // 'YYYY-MM-DD' del cierre de plazo (día 20)
  mes:           'enero' | 'julio'
  diasRestantes: number
}

const DIA_RECATEGORIZACION = 20  // referencia; AFIP confirma el día exacto cada semestre

export function proximaRecategorizacion(hoy: Date = new Date()): Recategorizacion {
  const year = hoy.getFullYear()
  // Candidatos: 20 ene de este año, 20 jul de este año, 20 ene del próximo.
  const candidatos: { fecha: Date; mes: 'enero' | 'julio' }[] = [
    { fecha: new Date(year,     0, DIA_RECATEGORIZACION), mes: 'enero' },
    { fecha: new Date(year,     6, DIA_RECATEGORIZACION), mes: 'julio' },
    { fecha: new Date(year + 1, 0, DIA_RECATEGORIZACION), mes: 'enero' },
  ]
  // Comparamos por fecha (a medianoche) para que "hoy es el día 20" cuente como hoy.
  const hoyMid = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const prox = candidatos.find(c => c.fecha >= hoyMid)!
  const diasRestantes = Math.round((prox.fecha.getTime() - hoyMid.getTime()) / 86_400_000)
  const iso = `${prox.fecha.getFullYear()}-${String(prox.fecha.getMonth() + 1).padStart(2, '0')}-${String(prox.fecha.getDate()).padStart(2, '0')}`
  return { fecha: iso, mes: prox.mes, diasRestantes }
}

// ─── 7) Generador de alertas del monotributo ─────────────────────────────────
// Función pura que evalúa la situación y devuelve alertas accionables.
// Se usa tanto en el panel del dashboard como en el cron de emails — una sola
// fuente de verdad para no divergir entre lo que ves y lo que te llega por mail.
export type NivelAlerta = 'info' | 'warning' | 'danger'

export type AlertaMonotributo = {
  nivel:   NivelAlerta
  // id estable por tipo de alerta — el cron lo usa para no spamear y para
  // decidir si manda email (solo warning/danger gatillan email).
  tipo:    'limite_superado' | 'cerca_limite' | 'ritmo_alto' | 'recategorizacion_proxima' | 'recategorizacion_con_exceso'
  titulo:  string
  detalle: string
}

export function generarAlertasMonotributo(
  config:   MonotributoConfig,
  facturas: FacturaEmitida[],
  hoy:      Date = new Date(),
): AlertaMonotributo[] {
  const alertas: AlertaMonotributo[] = []
  const limite      = config.limite_facturacion_anual
  if (limite <= 0) return alertas

  const facturado12 = facturacionUltimos12Meses(facturas, hoy)
  const pct         = (facturado12 / limite) * 100
  const restante    = limite - facturado12
  const recat       = proximaRecategorizacion(hoy)
  const fmt         = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

  // 1) Límite ya superado — lo más grave.
  if (facturado12 >= limite) {
    alertas.push({
      nivel:   'danger',
      tipo:    'limite_superado',
      titulo:  'Superaste el límite de tu categoría',
      detalle: `Facturaste ${fmt(facturado12)} en los últimos 12 meses, por encima del tope de ${fmt(limite)}. Vas a tener que recategorizar (o pasar a Responsable Inscripto si estás en la categoría máxima).`,
    })
  } else if (pct >= 95) {
    // 2) Muy cerca (95-100%).
    alertas.push({
      nivel:   'danger',
      tipo:    'cerca_limite',
      titulo:  'Estás al límite',
      detalle: `Vas ${pct.toFixed(0)}% del tope anual. Te quedan ${fmt(restante)} antes de tener que recategorizar.`,
    })
  } else if (pct >= 80) {
    // 3) Acercándote (80-95%).
    alertas.push({
      nivel:   'warning',
      tipo:    'cerca_limite',
      titulo:  'Cerca del límite',
      detalle: `Vas ${pct.toFixed(0)}% del tope anual. Te quedan ${fmt(restante)}.`,
    })
  }

  // 4) Ritmo alto: si proyectando los últimos 3 meses te pasás en <= 3 meses.
  //    Solo lo agregamos si todavía no superaste el límite (sino es redundante).
  if (facturado12 < limite) {
    const meses = proyeccionMesesHastaLimite(facturas, limite, facturado12, hoy)
    if (meses !== null && meses > 0 && meses <= 3) {
      alertas.push({
        nivel:   'warning',
        tipo:    'ritmo_alto',
        titulo:  'Tu ritmo te acerca al tope',
        detalle: `Al promedio de los últimos 3 meses, alcanzarías el límite en ~${meses} ${meses === 1 ? 'mes' : 'meses'}.`,
      })
    }
  }

  // 5) Recategorización próxima (faltan <= 30 días).
  if (recat.diasRestantes <= 30) {
    if (facturado12 >= limite) {
      alertas.push({
        nivel:   'danger',
        tipo:    'recategorizacion_con_exceso',
        titulo:  `Recategorización de ${recat.mes} a la vuelta`,
        detalle: `Faltan ${recat.diasRestantes} días y tu facturación supera el límite. Vas a tener que subir de categoría en este período.`,
      })
    } else {
      alertas.push({
        nivel:   'info',
        tipo:    'recategorizacion_proxima',
        titulo:  `Se viene la recategorización de ${recat.mes}`,
        detalle: `Faltan ${recat.diasRestantes} días. Revisá tu facturación de los últimos 12 meses antes del cierre.`,
      })
    }
  }

  return alertas
}
