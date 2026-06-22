// Tests para lib/monotributo — helpers puros de cálculo
import { describe, it, expect } from 'vitest'
import {
  facturacionUltimos12Meses,
  gaugeStatus,
  proyeccionMesesHastaLimite,
  facturasAgrupadasPorCliente,
  facturacionPorMes,
  proximaRecategorizacion,
  generarAlertasMonotributo,
  facturacionPorAnio,
  estadisticasFacturacion,
  estacionalidad,
  concentracionClientes,
  proyeccionAnual,
  type FacturaEmitida,
  type MonotributoConfig,
} from '@/lib/monotributo'

const mkFact = (fecha: string, monto: number, cliente = 'Cliente'): FacturaEmitida => ({
  id: `${fecha}-${monto}`,
  fecha,
  cliente,
  monto,
})

const mkConfig = (over: Partial<MonotributoConfig> = {}): MonotributoConfig => ({
  categoria:                'B',
  limite_facturacion_anual: 10_000_000,
  costo_mensual:            35_000,
  actividad:                'servicios',
  ...over,
})

// Fecha fija para los tests — evita flakiness por now()
const HOY = new Date('2026-06-20T12:00:00')

describe('facturacionUltimos12Meses', () => {
  it('suma facturas dentro de la ventana de 12 meses', () => {
    const facturas = [
      mkFact('2026-01-15', 100_000),
      mkFact('2025-08-10', 50_000),
      mkFact('2025-07-01', 30_000),  // dentro (hace ~11 meses)
    ]
    expect(facturacionUltimos12Meses(facturas, HOY)).toBe(180_000)
  })

  it('excluye facturas más viejas que 12 meses', () => {
    const facturas = [
      mkFact('2026-01-15', 100_000),
      mkFact('2024-12-15', 999_999),  // fuera (>12m)
    ]
    expect(facturacionUltimos12Meses(facturas, HOY)).toBe(100_000)
  })

  it('lista vacía devuelve 0', () => {
    expect(facturacionUltimos12Meses([], HOY)).toBe(0)
  })
})

describe('gaugeStatus', () => {
  it('< 80% del límite → ok', () => {
    expect(gaugeStatus(50_000, 100_000)).toBe('ok')
    expect(gaugeStatus(79_999, 100_000)).toBe('ok')
  })
  it('80%-94% del límite → warning', () => {
    expect(gaugeStatus(80_000, 100_000)).toBe('warning')
    expect(gaugeStatus(94_999, 100_000)).toBe('warning')
  })
  it('>= 95% del límite → danger', () => {
    expect(gaugeStatus(95_000, 100_000)).toBe('danger')
    expect(gaugeStatus(120_000, 100_000)).toBe('danger')
  })
  it('límite cero o negativo → ok (no divide por cero)', () => {
    expect(gaugeStatus(5000, 0)).toBe('ok')
  })
})

describe('proyeccionMesesHastaLimite', () => {
  it('proyecta basado en promedio últimos 3 meses', () => {
    // 3 facturas de los últimos 3 meses, $1M cada una → promedio mensual $1M
    // Límite $10M, facturado12 = $3M, restante = $7M → 7 meses
    const facturas = [
      mkFact('2026-06-01', 1_000_000),
      mkFact('2026-05-01', 1_000_000),
      mkFact('2026-04-01', 1_000_000),
    ]
    const result = proyeccionMesesHastaLimite(facturas, 10_000_000, 3_000_000, HOY)
    expect(result).toBe(7)
  })

  it('si ya pasó el límite → 0', () => {
    const result = proyeccionMesesHastaLimite([mkFact('2026-06-01', 100)], 1_000_000, 1_500_000, HOY)
    expect(result).toBe(0)
  })

  it('sin facturas recientes → null', () => {
    expect(proyeccionMesesHastaLimite([], 1_000_000, 0, HOY)).toBe(null)
  })

  it('límite <= 0 → null', () => {
    expect(proyeccionMesesHastaLimite([mkFact('2026-06-01', 1000)], 0, 0, HOY)).toBe(null)
  })
})

describe('facturasAgrupadasPorCliente', () => {
  it('agrupa por nombre normalizado (trim + lowercase)', () => {
    const facturas = [
      mkFact('2026-06-01', 1000, 'Cliente A'),
      mkFact('2026-06-15', 2000, 'cliente a '),  // mismo, distinta case + trailing space
      mkFact('2026-06-10', 500,  'Cliente B'),
    ]
    const grupos = facturasAgrupadasPorCliente(facturas)
    expect(grupos).toHaveLength(2)
    expect(grupos[0].cliente).toBe('Cliente A')  // mantiene capitalización del primero
    expect(grupos[0].total).toBe(3000)
    expect(grupos[0].count).toBe(2)
    expect(grupos[0].ultimaFecha).toBe('2026-06-15')
  })

  it('ordena por total desc', () => {
    const facturas = [
      mkFact('2026-06-01', 500,  'Pequeño'),
      mkFact('2026-06-01', 5000, 'Grande'),
    ]
    const grupos = facturasAgrupadasPorCliente(facturas)
    expect(grupos[0].cliente).toBe('Grande')
    expect(grupos[1].cliente).toBe('Pequeño')
  })

  it('ignora cliente vacío', () => {
    const facturas = [
      { ...mkFact('2026-06-01', 100, ''), cliente: '   ' },
      mkFact('2026-06-01', 100, 'Real'),
    ]
    const grupos = facturasAgrupadasPorCliente(facturas)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].cliente).toBe('Real')
  })
})

describe('facturacionPorMes', () => {
  it('genera N meses con totales', () => {
    const facturas = [
      mkFact('2026-06-15', 1000),
      mkFact('2026-05-15', 500),
    ]
    const meses = facturacionPorMes(facturas, 3, HOY)
    expect(meses).toHaveLength(3)
    expect(meses[2].mes).toBe('2026-06')
    expect(meses[2].total).toBe(1000)
    expect(meses[1].mes).toBe('2026-05')
    expect(meses[1].total).toBe(500)
    expect(meses[0].mes).toBe('2026-04')
    expect(meses[0].total).toBe(0)
  })

  it('facturas fuera de la ventana no se cuentan', () => {
    const facturas = [mkFact('2025-01-15', 9999)]
    const meses = facturacionPorMes(facturas, 3, HOY)
    expect(meses.every(m => m.total === 0)).toBe(true)
  })
})

describe('proximaRecategorizacion', () => {
  it('desde junio apunta a julio del mismo año', () => {
    const r = proximaRecategorizacion(new Date('2026-06-20T12:00:00'))
    expect(r.mes).toBe('julio')
    expect(r.fecha).toBe('2026-07-20')
    expect(r.diasRestantes).toBe(30)
  })

  it('desde marzo apunta a julio', () => {
    const r = proximaRecategorizacion(new Date('2026-03-01T12:00:00'))
    expect(r.mes).toBe('julio')
    expect(r.fecha).toBe('2026-07-20')
  })

  it('desde agosto apunta a enero del año siguiente', () => {
    const r = proximaRecategorizacion(new Date('2026-08-15T12:00:00'))
    expect(r.mes).toBe('enero')
    expect(r.fecha).toBe('2027-01-20')
  })

  it('el mismo día de recategorización cuenta como hoy (diasRestantes 0)', () => {
    const r = proximaRecategorizacion(new Date('2026-07-20T08:00:00'))
    expect(r.mes).toBe('julio')
    expect(r.diasRestantes).toBe(0)
  })
})

describe('generarAlertasMonotributo', () => {
  // Fecha lejos de enero/julio para aislar el caso "sin alertas" — en HOY
  // (20-jun) la recategorización de julio cae a 30 días y dispararía un info.
  const HOY_SIN_RECAT = new Date('2026-10-15T12:00:00')

  it('sin facturas, lejos de recategorización → sin alertas', () => {
    const alertas = generarAlertasMonotributo(mkConfig(), [], HOY_SIN_RECAT)
    expect(alertas).toHaveLength(0)
  })

  it('límite cero → sin alertas (no divide por cero)', () => {
    const alertas = generarAlertasMonotributo(mkConfig({ limite_facturacion_anual: 0 }), [mkFact('2026-06-01', 999)], HOY)
    expect(alertas).toHaveLength(0)
  })

  it('superó el límite → alerta danger limite_superado', () => {
    const facturas = [mkFact('2026-06-01', 11_000_000)]  // > 10M límite
    const alertas = generarAlertasMonotributo(mkConfig(), facturas, HOY)
    const tipos = alertas.map(a => a.tipo)
    expect(tipos).toContain('limite_superado')
    expect(alertas.find(a => a.tipo === 'limite_superado')?.nivel).toBe('danger')
  })

  it('entre 80-95% → alerta warning cerca_limite', () => {
    const facturas = [mkFact('2026-06-01', 8_500_000)]  // 85% de 10M
    const alertas = generarAlertasMonotributo(mkConfig(), facturas, HOY)
    const cerca = alertas.find(a => a.tipo === 'cerca_limite')
    expect(cerca?.nivel).toBe('warning')
  })

  it('entre 95-100% → alerta danger cerca_limite', () => {
    const facturas = [mkFact('2026-06-01', 9_700_000)]  // 97%
    const alertas = generarAlertasMonotributo(mkConfig(), facturas, HOY)
    const cerca = alertas.find(a => a.tipo === 'cerca_limite')
    expect(cerca?.nivel).toBe('danger')
  })

  it('ritmo alto (proyección <= 3 meses) → alerta ritmo_alto', () => {
    // 3 facturas de $2M en últimos 3 meses → promedio $2M/mes.
    // facturado12 = 6M, restante = 4M → 2 meses al límite.
    const facturas = [
      mkFact('2026-06-01', 2_000_000),
      mkFact('2026-05-01', 2_000_000),
      mkFact('2026-04-01', 2_000_000),
    ]
    const alertas = generarAlertasMonotributo(mkConfig(), facturas, HOY)
    expect(alertas.map(a => a.tipo)).toContain('ritmo_alto')
  })

  it('recategorización a <=30 días sin exceso → alerta info', () => {
    // HOY 2026-06-20 → recat julio en 30 días. Facturación baja (10%).
    const facturas = [mkFact('2026-06-01', 1_000_000)]
    const alertas = generarAlertasMonotributo(mkConfig(), facturas, HOY)
    const recat = alertas.find(a => a.tipo === 'recategorizacion_proxima')
    expect(recat?.nivel).toBe('info')
  })

  it('recategorización próxima CON exceso → alerta danger recategorizacion_con_exceso', () => {
    const facturas = [mkFact('2026-06-01', 12_000_000)]  // supera límite
    const alertas = generarAlertasMonotributo(mkConfig(), facturas, HOY)
    const recat = alertas.find(a => a.tipo === 'recategorizacion_con_exceso')
    expect(recat?.nivel).toBe('danger')
    // Y NO debe aparecer la versión "info" simultáneamente
    expect(alertas.find(a => a.tipo === 'recategorizacion_proxima')).toBeUndefined()
  })
})

describe('facturacionPorAnio', () => {
  it('agrupa por año, ordena asc y calcula crecimiento YoY', () => {
    const facturas = [
      mkFact('2024-03-01', 1_000_000),
      mkFact('2024-08-01', 1_000_000),  // 2024 total = 2M
      mkFact('2025-05-01', 3_000_000),  // 2025 total = 3M → +50%
    ]
    const anios = facturacionPorAnio(facturas)
    expect(anios).toHaveLength(2)
    expect(anios[0]).toMatchObject({ anio: 2024, total: 2_000_000, count: 2, crecimientoPct: null })
    expect(anios[1].anio).toBe(2025)
    expect(anios[1].total).toBe(3_000_000)
    expect(anios[1].crecimientoPct).toBeCloseTo(50)
  })

  it('lista vacía → []', () => {
    expect(facturacionPorAnio([])).toEqual([])
  })
})

describe('estadisticasFacturacion', () => {
  it('calcula total, promedio mensual, mejor/peor mes', () => {
    const facturas = [
      mkFact('2026-01-15', 1_000_000),
      mkFact('2026-02-10', 3_000_000),
      mkFact('2026-03-20', 2_000_000),
    ]
    const st = estadisticasFacturacion(facturas, 2026)
    expect(st.total).toBe(6_000_000)
    expect(st.mesesConFactura).toBe(3)
    expect(st.promedioMensual).toBe(2_000_000)
    expect(st.mejorMes?.total).toBe(3_000_000)
    expect(st.peorMes?.total).toBe(1_000_000)
  })

  it('filtra por año cuando se pasa', () => {
    const facturas = [
      mkFact('2025-01-15', 5_000_000),
      mkFact('2026-01-15', 1_000_000),
    ]
    expect(estadisticasFacturacion(facturas, 2026).total).toBe(1_000_000)
    expect(estadisticasFacturacion(facturas).total).toBe(6_000_000)  // sin año = todo
  })

  it('CV bajo cuando los meses son parejos, alto cuando varían', () => {
    const parejo = [mkFact('2026-01-15', 1_000_000), mkFact('2026-02-15', 1_000_000)]
    const dispar = [mkFact('2026-01-15', 100_000),   mkFact('2026-02-15', 5_000_000)]
    expect(estadisticasFacturacion(parejo, 2026).coefVariacion).toBe(0)
    expect(estadisticasFacturacion(dispar, 2026).coefVariacion).toBeGreaterThan(50)
  })

  it('sin facturas → ceros sin romper', () => {
    const st = estadisticasFacturacion([], 2026)
    expect(st.total).toBe(0)
    expect(st.promedioMensual).toBe(0)
    expect(st.mejorMes).toBeNull()
  })
})

describe('estacionalidad', () => {
  it('promedia cada mes-del-año sobre los años con datos', () => {
    const facturas = [
      mkFact('2025-12-15', 2_000_000),
      mkFact('2026-12-15', 4_000_000),  // diciembre en 2 años → promedio 3M
      mkFact('2026-06-15', 1_000_000),  // junio en 1 año → promedio 1M
    ]
    const est = estacionalidad(facturas)
    expect(est).toHaveLength(12)
    const dic = est.find(m => m.mes === 12)!
    expect(dic.total).toBe(6_000_000)
    expect(dic.anios).toBe(2)
    expect(dic.promedio).toBe(3_000_000)
    const jun = est.find(m => m.mes === 6)!
    expect(jun.promedio).toBe(1_000_000)
    const ene = est.find(m => m.mes === 1)!
    expect(ene.promedio).toBe(0)
  })
})

describe('concentracionClientes', () => {
  it('calcula % del cliente top y top3', () => {
    const facturas = [
      mkFact('2026-01-01', 8_000_000, 'Cliente Grande'),
      mkFact('2026-01-01', 1_000_000, 'Cliente B'),
      mkFact('2026-01-01', 1_000_000, 'Cliente C'),
    ]
    const c = concentracionClientes(facturas)
    expect(c.totalClientes).toBe(3)
    expect(c.topCliente?.cliente).toBe('Cliente Grande')
    expect(c.topCliente?.pct).toBeCloseTo(80)
    expect(c.top3Pct).toBeCloseTo(100)
  })

  it('sin facturas → topCliente null', () => {
    expect(concentracionClientes([]).topCliente).toBeNull()
  })
})

describe('proyeccionAnual', () => {
  it('extrapola el run-rate del año en curso', () => {
    // HOY junio (mes 6). Acumulado 6M → run-rate (6M/6)*12 = 12M
    const facturas = [mkFact('2026-03-01', 6_000_000)]
    expect(proyeccionAnual(facturas, 2026, HOY)).toBe(12_000_000)
  })

  it('año pasado → null (ya cerrado)', () => {
    const facturas = [mkFact('2025-03-01', 6_000_000)]
    expect(proyeccionAnual(facturas, 2025, HOY)).toBeNull()
  })

  it('sin facturas del año → null', () => {
    expect(proyeccionAnual([], 2026, HOY)).toBeNull()
  })
})
