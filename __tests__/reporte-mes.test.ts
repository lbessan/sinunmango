// Tests para lib/reporte-mes/data.ts + lib/reporte-mes/html.ts
//
// El layer de PDF (puppeteer) NO se testea acá — requiere Chromium real.
// Lo cubrimos via smoke tests en CI / manual en local.
//
// Estos tests garantizan que:
//   - data.ts agrega correctamente los movimientos por categoría/top
//   - html.ts produce HTML válido y escapea inputs sospechosos (XSS)
//   - fechas y formato funcionan en edge cases (mes con fin distinto)

import { describe, it, expect, vi } from 'vitest'
import { calcularReporteMes } from '@/lib/reporte-mes/data'
import { reporteToHtml } from '@/lib/reporte-mes/html'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const USER_ID = '11111111-1111-1111-1111-111111111111'

// Builder de supabase que devuelve datos canned para cada from(...) call.
// El endpoint hace 5 queries en paralelo en este orden:
//   1. movimientos_completos (gastos/ingresos del mes)
//   2. categorias
//   3. saldo_actual_cuentas (general)
//   4. movimientos_completos (deuda tarjetas del período)
//   5. saldo_actual_cuentas (sin tarjetas)
function makeSupabase(opts: {
  movs?:         unknown[]
  categorias?:   unknown[]
  cuentas?:      unknown[]
  deudaTarj?:    unknown[]
  saldos?:       unknown[]
} = {}): SupabaseClient<Database> {
  // El supabase fluent builder se resuelve a la promise al final del chain.
  // Cada `from()` puede ser llamado N veces, así que devolvemos chains que
  // se identifican por el patrón de calls antes del await.
  const callsByTable: Record<string, number> = {}

  const movsResults = [opts.movs ?? [], opts.deudaTarj ?? []]
  const saldosResults = [opts.cuentas ?? [], opts.saldos ?? []]

  const from = vi.fn((table: string) => {
    callsByTable[table] = (callsByTable[table] ?? 0) + 1

    // Builder que va devolviéndose a sí mismo hasta el await final.
    // El resultado del await depende de la tabla.
    const builder: Record<string, unknown> = {}

    const chainable = (final: unknown) => {
      const obj = {
        select:  vi.fn(() => obj),
        eq:      vi.fn(() => obj),
        in:      vi.fn(() => obj),
        neq:     vi.fn(() => obj),
        gte:     vi.fn(() => obj),
        lt:      vi.fn(() => obj),
        order:   vi.fn(() => obj),
        then:    (resolve: (v: unknown) => unknown) => resolve({ data: final, error: null }),
      }
      return obj
    }

    if (table === 'movimientos_completos') {
      const callIdx = (callsByTable[table] ?? 1) - 1
      Object.assign(builder, chainable(movsResults[callIdx] ?? []))
    } else if (table === 'categorias') {
      Object.assign(builder, chainable(opts.categorias ?? []))
    } else if (table === 'saldo_actual_cuentas') {
      const callIdx = (callsByTable[table] ?? 1) - 1
      Object.assign(builder, chainable(saldosResults[callIdx] ?? []))
    } else {
      Object.assign(builder, chainable([]))
    }

    return builder
  })

  return { from } as unknown as SupabaseClient<Database>
}

describe('calcularReporteMes', () => {
  it('mes inválido → throw', async () => {
    await expect(
      calcularReporteMes(makeSupabase(), USER_ID, '2026/05'),
    ).rejects.toThrow(/Mes inválido/)
  })

  it('mes vacío → throw', async () => {
    await expect(
      calcularReporteMes(makeSupabase(), USER_ID, ''),
    ).rejects.toThrow(/Mes inválido/)
  })

  it('mes sin datos → KPIs en cero y arrays vacíos', async () => {
    const result = await calcularReporteMes(makeSupabase(), USER_ID, '2026-05')
    expect(result.mes).toBe('2026-05')
    expect(result.mesLabel).toBe('Mayo 2026')
    expect(result.kpis.ingresos).toBe(0)
    expect(result.kpis.gastos).toBe(0)
    expect(result.kpis.balance).toBe(0)
    expect(result.kpis.gastosPctIng).toBe(0)
    expect(result.porCategoria).toEqual([])
    expect(result.topGastos).toEqual([])
  })

  it('calcula KPIs y top gastos correctamente', async () => {
    const sb = makeSupabase({
      movs: [
        { fecha: '2026-05-01', detalle: 'Sueldo',       monto: 1_500_000, moneda: 'ARS', tipo_movimiento: 'Ingreso', categoria_nombre: 'Trabajo',     cuenta_origen_nombre: 'Galicia' },
        { fecha: '2026-05-05', detalle: 'Alquiler',     monto: 450_000,   moneda: 'ARS', tipo_movimiento: 'Gasto',   categoria_nombre: 'Vivienda',    cuenta_origen_nombre: 'Galicia' },
        { fecha: '2026-05-10', detalle: 'Supermercado', monto: 80_000,    moneda: 'ARS', tipo_movimiento: 'Gasto',   categoria_nombre: 'Comida',      cuenta_origen_nombre: 'Galicia' },
        { fecha: '2026-05-15', detalle: 'Netflix',      monto: 5_000,     moneda: 'ARS', tipo_movimiento: 'Gasto',   categoria_nombre: 'Suscripciones', cuenta_origen_nombre: 'Visa' },
      ],
    })

    const result = await calcularReporteMes(sb, USER_ID, '2026-05')
    expect(result.kpis.ingresos).toBe(1_500_000)
    expect(result.kpis.gastos).toBe(535_000)
    expect(result.kpis.balance).toBe(965_000)
    // 535000 / 1500000 ≈ 35.67 → 36
    expect(result.kpis.gastosPctIng).toBe(36)
    expect(result.kpis.movimientosCount).toBe(4)

    // Top gastos: Alquiler (450k) > Supermercado (80k) > Netflix (5k)
    expect(result.topGastos).toHaveLength(3)
    expect(result.topGastos[0].detalle).toBe('Alquiler')
    expect(result.topGastos[0].monto).toBe(450_000)
    expect(result.topGastos[1].detalle).toBe('Supermercado')

    // Categorías ordenadas por monto desc
    expect(result.porCategoria[0].categoria_nombre).toBe('Vivienda')
    expect(result.porCategoria[0].monto).toBe(450_000)
    // 450k / 535k ≈ 84.1%
    expect(result.porCategoria[0].pct).toBeCloseTo(84.1, 1)
  })

  it('USD no afecta KPIs ARS (queda como info aparte si lo sumás después)', async () => {
    const sb = makeSupabase({
      movs: [
        { fecha: '2026-05-01', detalle: 'Sueldo',  monto: 1000, moneda: 'ARS', tipo_movimiento: 'Ingreso', categoria_nombre: 'Trabajo' },
        { fecha: '2026-05-02', detalle: 'AirBnB',  monto: 200,  moneda: 'USD', tipo_movimiento: 'Gasto',   categoria_nombre: 'Viajes' },
      ],
    })
    const result = await calcularReporteMes(sb, USER_ID, '2026-05')
    expect(result.kpis.ingresos).toBe(1000)
    expect(result.kpis.gastos).toBe(0)
    expect(result.topGastos).toHaveLength(0)
  })

  it('agrupa "Otros" cuando hay más de 9 categorías', async () => {
    const movs = Array.from({ length: 12 }, (_, i) => ({
      fecha:             `2026-05-${String(i + 1).padStart(2, '0')}`,
      detalle:           `Gasto ${i}`,
      monto:             1000 * (12 - i),  // decreciente
      moneda:            'ARS',
      tipo_movimiento:   'Gasto',
      categoria_nombre:  `Cat-${i}`,
      cuenta_origen_nombre: 'Galicia',
    }))
    const result = await calcularReporteMes(makeSupabase({ movs }), USER_ID, '2026-05')
    // 12 categorías distintas → debería agruparse en 8 + "Otros"
    expect(result.porCategoria).toHaveLength(9)
    expect(result.porCategoria[8].categoria_nombre).toBe('Otros')
    // Los 4 últimos (Cat-8 a Cat-11): montos 4000, 3000, 2000, 1000 = 10000
    expect(result.porCategoria[8].monto).toBe(10000)
  })

  it('mesLabel funciona para distintos meses', async () => {
    const enero = await calcularReporteMes(makeSupabase(), USER_ID, '2026-01')
    expect(enero.mesLabel).toBe('Enero 2026')
    const dic = await calcularReporteMes(makeSupabase(), USER_ID, '2025-12')
    expect(dic.mesLabel).toBe('Diciembre 2025')
  })
})

describe('reporteToHtml', () => {
  const baseData = {
    mes:        '2026-05',
    mesLabel:   'Mayo 2026',
    generadoEn: '2026-05-27T12:00:00Z',
    kpis: {
      ingresos: 100_000,
      gastos: 50_000,
      balance: 50_000,
      gastosPctIng: 50,
      movimientosCount: 5,
    },
    porCategoria: [
      { categoria_nombre: 'Comida', monto: 30_000, pct: 60 },
      { categoria_nombre: 'Transporte', monto: 20_000, pct: 40 },
    ],
    topGastos: [
      { fecha: '2026-05-15', detalle: 'Super', monto: 15_000, categoria: 'Comida', cuenta: 'Galicia' },
    ],
    tarjetas: [],
    cuentas: [
      { nombre_cuenta: 'Galicia', tipo_cuenta: 'Banco', moneda: 'ARS', saldo: 250_000 },
    ],
  }

  it('genera HTML que contiene el período + KPIs', () => {
    const html = reporteToHtml(baseData)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Mayo 2026')
    expect(html).toContain('$100.000')   // ingresos formateados es-AR
    expect(html).toContain('$50.000')    // gastos
    expect(html).toContain('+$50.000')   // balance positivo
    expect(html).toContain('50%')         // ratio gastos/ingresos
  })

  it('escapea HTML en detalle/categoría (anti-XSS)', () => {
    const data = {
      ...baseData,
      topGastos: [
        { fecha: '2026-05-15', detalle: '<script>alert("xss")</script>', monto: 100, categoria: 'X', cuenta: 'Y' },
      ],
    }
    const html = reporteToHtml(data)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('marca balance negativo en rojo', () => {
    const data = {
      ...baseData,
      kpis: { ...baseData.kpis, ingresos: 50_000, gastos: 100_000, balance: -50_000 },
    }
    const html = reporteToHtml(data)
    // El signo de menos visual + color rojo en estilo inline
    expect(html).toContain('−$50.000')
    expect(html).toMatch(/color:\s*#b91c1c/)
  })

  it('omite secciones tarjetas/cuentas si vienen vacías', () => {
    const data = { ...baseData, tarjetas: [], cuentas: [] }
    const html = reporteToHtml(data)
    expect(html).not.toContain('Tarjetas de crédito')
    expect(html).not.toContain('Cuentas')
  })

  it('incluye tarjetas con deuda ARS y USD', () => {
    const data = {
      ...baseData,
      tarjetas: [
        { nombre_cuenta: 'Visa Signature', deuda_ars: 200_000, deuda_usd: 50.5 },
      ],
    }
    const html = reporteToHtml(data)
    expect(html).toContain('Visa Signature')
    expect(html).toContain('$200.000')
    expect(html).toContain('US$ 50,50')
  })

  it('renderiza barras de % con width clampeado a 100', () => {
    const data = {
      ...baseData,
      porCategoria: [
        // pct >100 puede pasar si gastos > ingresos en un caso edge — la barra
        // debe quedar al 100% (no overflow).
        { categoria_nombre: 'Mucho', monto: 1000, pct: 150 },
      ],
    }
    const html = reporteToHtml(data)
    expect(html).toMatch(/width:\s*100%/)
    // Pero el % label sigue mostrando el valor real
    expect(html).toContain('150.0%')
  })
})
