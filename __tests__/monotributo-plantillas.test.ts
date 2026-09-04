// Tests de las plantillas de factura: qué período, qué vencimiento y qué texto
// sale al aplicarlas. Casos armados con las facturas reales 114/115/116.
import { describe, it, expect } from 'vitest'
import {
  resolverPeriodo, resolverPlaceholders, sumarDias, ultimoDiaMes,
  aplicarPlantilla, totalPlantilla, normalizarItems, type Plantilla,
} from '@/lib/monotributo-plantillas'

describe('fechas', () => {
  it('ultimoDiaMes contempla meses cortos y bisiestos', () => {
    expect(ultimoDiaMes(2026, 8)).toBe(31)
    expect(ultimoDiaMes(2026, 2)).toBe(28)
    expect(ultimoDiaMes(2028, 2)).toBe(29)   // bisiesto
    expect(ultimoDiaMes(2026, 4)).toBe(30)
  })

  it('sumarDias cruza fin de mes y fin de año', () => {
    expect(sumarDias('2026-08-31', 7)).toBe('2026-09-07')
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04')
    expect(sumarDias('2026-09-03', 4)).toBe('2026-09-07')
  })

  it('mes_actual = el mes en el que se emite (factura 114: emitida 31/08 por agosto)', () => {
    expect(resolverPeriodo('mes_actual', '2026-08-31')).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' })
  })

  it('mes_anterior = el mes pasado (factura 116: emitida 03/09 por agosto)', () => {
    expect(resolverPeriodo('mes_anterior', '2026-09-03')).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' })
  })

  it('mes_anterior en enero retrocede de año', () => {
    expect(resolverPeriodo('mes_anterior', '2027-01-05')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
  })

  it('dia_emision = solo ese día (factura 115: reintegro del 03/09)', () => {
    expect(resolverPeriodo('dia_emision', '2026-09-03')).toEqual({ desde: '2026-09-03', hasta: '2026-09-03' })
  })
})

describe('placeholders', () => {
  it('{mes} y {anio} salen del PERÍODO, no de la fecha de emisión', () => {
    // Emitida en septiembre por el período de agosto → tiene que decir Agosto.
    expect(resolverPlaceholders('Servicio de Desarrollo {mes} {anio}', '2026-08-01'))
      .toBe('Servicio de Desarrollo Agosto 2026')
  })

  it('acepta mayúsculas y {año} con eñe', () => {
    expect(resolverPlaceholders('{MES} {año}', '2026-12-01')).toBe('Diciembre 2026')
  })

  it('un texto sin placeholders queda igual', () => {
    expect(resolverPlaceholders('Impuestos Reintegro', '2026-09-03')).toBe('Impuestos Reintegro')
  })
})

// ── Las 3 plantillas reales ──────────────────────────────────────────────────
const base = { id: 'x', doc_tipo: 80, condicion_iva: 1, concepto: 2, pto_vta: null }

const NOMINA_MENSUAL: Plantilla = {
  ...base, nombre: 'Nómina Sueldos — mensual',
  cliente_nombre: 'NOMINA SUELDOS NET S.A', doc_nro: '30717901262',
  items: [
    { descripcion: 'Honorario profesionales', cantidad: 1, precio: 1728000 },
    { descripcion: 'Honorario especiales', cantidad: 1, precio: 1896000 },
    { descripcion: 'Tiempo Libre', cantidad: 1, precio: 192000 },
  ],
  periodo_modo: 'mes_actual', dias_vto_pago: 7,
}

const ALBOR: Plantilla = {
  ...base, nombre: 'Albor Agtech — desarrollo',
  cliente_nombre: 'ALBOR AGTECH S. A.', doc_nro: '30708825472',
  items: [
    { descripcion: 'Servicio de Desarrollo {mes} {anio}', cantidad: 1, precio: 2526566.68 },
    { descripcion: 'Servicio de Desarrollo {mes} {anio}', cantidad: 1, precio: 220497.19 },
    { descripcion: 'Servicio de Desarrollo {mes} {anio}', cantidad: 1, precio: 350858.27 },
  ],
  periodo_modo: 'mes_anterior', dias_vto_pago: 7,
}

describe('aplicarPlantilla — reproduce las facturas reales', () => {
  it('Nómina mensual emitida el 31/08 reproduce la factura 00001-00000114', () => {
    const f = aplicarPlantilla(NOMINA_MENSUAL, '2026-08-31')
    expect(f.periodoDesde).toBe('2026-08-01')
    expect(f.periodoHasta).toBe('2026-08-31')
    expect(f.vtoPago).toBe('2026-09-07')          // igual que el PDF real
    expect(totalPlantilla(f.items)).toBe(3816000) // igual que el PDF real
    expect(f.clienteNombre).toBe('NOMINA SUELDOS NET S.A')
  })

  it('Albor emitida el 03/09 reproduce la factura 00001-00000116', () => {
    const f = aplicarPlantilla(ALBOR, '2026-09-03')
    expect(f.periodoDesde).toBe('2026-08-01')
    expect(f.periodoHasta).toBe('2026-08-31')
    expect(f.vtoPago).toBe('2026-09-10')                    // igual que el PDF real
    expect(f.items[0].descripcion).toBe('Servicio de Desarrollo Agosto 2026')
    expect(totalPlantilla(f.items)).toBeCloseTo(3097922.14, 2)  // igual que el PDF real
  })

  it('al mes siguiente la descripción se actualiza sola', () => {
    const f = aplicarPlantilla(ALBOR, '2026-10-03')
    expect(f.items[0].descripcion).toBe('Servicio de Desarrollo Septiembre 2026')
    expect(f.periodoDesde).toBe('2026-09-01')
  })

  it('no muta la plantilla original (los placeholders quedan sin resolver)', () => {
    aplicarPlantilla(ALBOR, '2026-10-03')
    expect(ALBOR.items[0].descripcion).toBe('Servicio de Desarrollo {mes} {anio}')
  })
})

describe('normalizarItems', () => {
  it('descarta basura y castea números', () => {
    expect(normalizarItems([
      { descripcion: 'A', cantidad: '2', precio: '100.5' },
      { descripcion: '', cantidad: 1, precio: 0 },       // vacío → fuera
      null,
    ])).toEqual([{ descripcion: 'A', cantidad: 2, precio: 100.5 }])
  })

  it('lo que no es array devuelve vacío', () => {
    expect(normalizarItems('nope')).toEqual([])
    expect(normalizarItems(null)).toEqual([])
  })
})

// El JSON de items tal cual queda guardado por la migración semilla.
describe('cadena completa desde el JSON guardado en la DB', () => {
  const ITEMS_ALBOR_JSON = `[{"descripcion":"Servicio de Desarrollo {mes} {anio}","cantidad":1,"precio":2526566.68},
      {"descripcion":"Servicio de Desarrollo {mes} {anio}","cantidad":1,"precio":220497.19},
      {"descripcion":"Servicio de Desarrollo {mes} {anio}","cantidad":1,"precio":350858.27}]`

  it('JSON de la DB → normalizarItems → aplicarPlantilla reproduce la 116', () => {
    const items = normalizarItems(JSON.parse(ITEMS_ALBOR_JSON))
    expect(items).toHaveLength(3)
    const f = aplicarPlantilla({ ...ALBOR, items }, '2026-09-03')
    expect(f.items.map(i => i.descripcion)).toEqual([
      'Servicio de Desarrollo Agosto 2026',
      'Servicio de Desarrollo Agosto 2026',
      'Servicio de Desarrollo Agosto 2026',
    ])
    expect(totalPlantilla(f.items)).toBeCloseTo(3097922.14, 2)
    expect(f.vtoPago).toBe('2026-09-10')
  })
})
