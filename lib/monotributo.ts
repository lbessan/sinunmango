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
