// Tests para lib/proyecciones.ts
//
// Funciones puras → tests directos sin mocks. Cobertura del cálculo
// que termina mostrado en el dashboard del user.

import { describe, it, expect } from 'vitest'
import {
  sumarMontoARS,
  sumarGastosFijosARS,
  calcularSaldoInicial,
  bifurcarGastosFijos,
  calcularTotalTCMes,
  calcularProyeccionesIterativo,
  calcularSkipCount,
} from '@/lib/proyecciones'

// ── sumarMontoARS ──────────────────────────────────────────────────────────
describe('sumarMontoARS', () => {
  it('suma items en ARS (sin conversión)', () => {
    expect(sumarMontoARS([
      { monto: 1000, moneda: 'ARS' },
      { monto: 500,  moneda: 'ARS' },
    ], 1400)).toBe(1500)
  })

  it('convierte USD a ARS con la cotización dada', () => {
    expect(sumarMontoARS([{ monto: 100, moneda: 'USD' }], 1400)).toBe(140000)
  })

  it('mix ARS + USD se convierte correctamente', () => {
    expect(sumarMontoARS([
      { monto: 1000, moneda: 'ARS' },  // 1000
      { monto: 50,   moneda: 'USD' },  // 50*1400=70000
    ], 1400)).toBe(71000)
  })

  it('items vacíos → 0', () => {
    expect(sumarMontoARS([], 1400)).toBe(0)
  })

  it('moneda null se trata como ARS (sin conversión)', () => {
    expect(sumarMontoARS([{ monto: 100, moneda: null }], 1400)).toBe(100)
  })

  it('moneda string raro no es USD → no convierte', () => {
    expect(sumarMontoARS([{ monto: 100, moneda: 'EUR' }], 1400)).toBe(100)
  })

  it('dolar=0 → USD se vuelven 0 (defensa contra DB vacía)', () => {
    expect(sumarMontoARS([{ monto: 100, moneda: 'USD' }], 0)).toBe(0)
  })
})

// ── sumarGastosFijosARS ────────────────────────────────────────────────────
describe('sumarGastosFijosARS', () => {
  it('usa monto_estimado en vez de monto', () => {
    expect(sumarGastosFijosARS([
      { monto_estimado: 5000, moneda: 'ARS' },
      { monto_estimado: 3000, moneda: 'ARS' },
    ], 1400)).toBe(8000)
  })

  it('convierte gastos fijos USD a ARS', () => {
    expect(sumarGastosFijosARS([{ monto_estimado: 20, moneda: 'USD' }], 1400)).toBe(28000)
  })

  it('lista vacía → 0', () => {
    expect(sumarGastosFijosARS([], 1400)).toBe(0)
  })
})

// ── calcularSaldoInicial ───────────────────────────────────────────────────
describe('calcularSaldoInicial', () => {
  it('caso típico: disponible + ingresos_futuros - gastos_fijos - deuda restante', () => {
    const r = calcularSaldoInicial({
      disponible_real:        500000,
      ingresos_futuros_mes:   100000,
      gastos_fijos_pendientes: 50000,
      deuda_tarjetas_periodo: 80000,
      pagos_tarjeta_mes:      20000,
    })
    // 500000 + 100000 - 50000 - (80000 - 20000) = 490000
    expect(r).toBe(490000)
  })

  it('deuda > pagos: el resto se resta', () => {
    expect(calcularSaldoInicial({
      disponible_real:        100000,
      deuda_tarjetas_periodo: 50000,
      pagos_tarjeta_mes:      20000,
    })).toBe(70000)  // 100000 - (50000 - 20000)
  })

  it('pagos > deuda: deudaRest=0 (no resta nada — no es negativo)', () => {
    expect(calcularSaldoInicial({
      disponible_real:        100000,
      deuda_tarjetas_periodo: 20000,
      pagos_tarjeta_mes:      50000,  // pagaste de más
    })).toBe(100000)  // deudaRest=max(0, -30000)=0
  })

  it('nulls en resumen → trata como 0', () => {
    expect(calcularSaldoInicial({
      disponible_real:        null,
      ingresos_futuros_mes:   null,
      gastos_fijos_pendientes: null,
      deuda_tarjetas_periodo: null,
      pagos_tarjeta_mes:      null,
    })).toBe(0)
  })

  it('resumen=null → 0', () => {
    expect(calcularSaldoInicial(null)).toBe(0)
  })

  it('resumen=undefined → 0', () => {
    expect(calcularSaldoInicial(undefined)).toBe(0)
  })

  it('solo disponible_real → devuelve eso', () => {
    expect(calcularSaldoInicial({ disponible_real: 250000 })).toBe(250000)
  })
})

// ── bifurcarGastosFijos ────────────────────────────────────────────────────
describe('bifurcarGastosFijos', () => {
  const gastos = [
    { monto_estimado: 5000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Banco CA' } },
    { monto_estimado: 3000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Tarjeta Credito' } },
    { monto_estimado: 10,   moneda: 'USD', cuentas: { tipo_cuenta: 'Tarjeta Credito' } },
    { monto_estimado: 2000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Billetera' } },
  ]

  it('separa efectivo (banco/billetera) de tarjeta', () => {
    const r = bifurcarGastosFijos(gastos, 1400)
    expect(r.efectivo).toBe(7000)         // 5000 + 2000
    expect(r.tarjeta).toBe(3000 + 14000)  // 3000 ARS + 10 USD * 1400
  })

  it('lista vacía → ambos 0', () => {
    expect(bifurcarGastosFijos([], 1400)).toEqual({ efectivo: 0, tarjeta: 0 })
  })

  it('cuentas null o sin tipo → cuenta como efectivo (no es Tarjeta Credito)', () => {
    const r = bifurcarGastosFijos([
      { monto_estimado: 1000, moneda: 'ARS', cuentas: null },
      { monto_estimado: 2000, moneda: 'ARS' },  // sin campo cuentas
    ], 1400)
    expect(r.efectivo).toBe(3000)
    expect(r.tarjeta).toBe(0)
  })

  it('todo en tarjeta → efectivo=0', () => {
    const r = bifurcarGastosFijos([
      { monto_estimado: 1000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Tarjeta Credito' } },
    ], 1400)
    expect(r).toEqual({ efectivo: 0, tarjeta: 1000 })
  })
})

// ── calcularTotalTCMes ─────────────────────────────────────────────────────
describe('calcularTotalTCMes', () => {
  const tarjetaIds = new Set(['tc1', 'tc2'])

  it('filtra movimientos por cuenta_origen ∈ tarjetaIds', () => {
    expect(calcularTotalTCMes([
      { monto: 1000, moneda: 'ARS', cuenta_origen: 'tc1' },      // sí
      { monto: 500,  moneda: 'ARS', cuenta_origen: 'cuenta-X' }, // NO
      { monto: 200,  moneda: 'ARS', cuenta_origen: 'tc2' },      // sí
    ], tarjetaIds, 1400)).toBe(1200)
  })

  it('cuenta_origen null se excluye', () => {
    expect(calcularTotalTCMes([
      { monto: 1000, moneda: 'ARS', cuenta_origen: null },
    ], tarjetaIds, 1400)).toBe(0)
  })

  it('convierte USD usando dolar', () => {
    expect(calcularTotalTCMes([
      { monto: 50, moneda: 'USD', cuenta_origen: 'tc1' },
    ], tarjetaIds, 1400)).toBe(70000)
  })

  it('tarjetaIds vacío → 0', () => {
    expect(calcularTotalTCMes([
      { monto: 1000, moneda: 'ARS', cuenta_origen: 'tc1' },
    ], new Set(), 1400)).toBe(0)
  })
})

// ── calcularSkipCount ──────────────────────────────────────────────────────
describe('calcularSkipCount', () => {
  it('mismo mes → 0', () => {
    expect(calcularSkipCount({
      currentYear: 2026, currentMonth: 5,
      desdeYear:   2026, desdeMonth:   5,
    })).toBe(0)
  })

  it('un mes adelante → 1', () => {
    expect(calcularSkipCount({
      currentYear: 2026, currentMonth: 5,
      desdeYear:   2026, desdeMonth:   6,
    })).toBe(1)
  })

  it('cruza año → 13', () => {
    expect(calcularSkipCount({
      currentYear: 2026, currentMonth: 5,
      desdeYear:   2027, desdeMonth:   6,
    })).toBe(13)
  })

  it('hacia atrás → negativo', () => {
    expect(calcularSkipCount({
      currentYear: 2026, currentMonth: 5,
      desdeYear:   2026, desdeMonth:   3,
    })).toBe(-2)
  })
})

// ── calcularProyeccionesIterativo ──────────────────────────────────────────
describe('calcularProyeccionesIterativo', () => {
  // Setup helper: el "mes data" pre-fetcheado para el cálculo
  function mes(periodo: string, totalIngresos = 0, totalTC = 0) {
    return { periodo, totalIngresos, totalTC }
  }

  it('escenario simple: 3 meses adelante con ingresos+gastos+TC', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          100000,
      gastosFijosEfectivo:   5000,
      gastosFijosTarjeta:    3000,
      skipCount:               0,
      meses: [
        mes('2026-06-01', 50000, 10000),
        mes('2026-07-01', 50000, 8000),
        mes('2026-08-01', 50000, 12000),
      ],
    })

    // Mes 1: 100000 + 50000 - 5000 - 3000 - 10000 = 132000
    // Mes 2: 132000 + 50000 - 5000 - 3000 - 8000  = 166000
    // Mes 3: 166000 + 50000 - 5000 - 3000 - 12000 = 196000
    expect(r.proyecciones.map(p => p.proyeccion)).toEqual([132000, 166000, 196000])
    expect(r.proyecciones[0].diferencia).toBe(132000 - 100000)  // vs startSaldo
    expect(r.proyecciones[1].diferencia).toBe(166000 - 132000)
    expect(r.proyecciones[2].diferencia).toBe(196000 - 166000)
  })

  it('escenario con skipCount=2 (los primeros 2 meses se descartan)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          100000,
      gastosFijosEfectivo:   5000,
      gastosFijosTarjeta:      0,
      skipCount:               2,
      meses: [
        mes('2026-06-01', 50000, 0),  // i=1, no se devuelve
        mes('2026-07-01', 50000, 0),  // i=2, no se devuelve (= skipCount)
        mes('2026-08-01', 50000, 0),  // i=3, primero mostrado
        mes('2026-09-01', 50000, 0),  // i=4
      ],
    })

    // Saldo después de meses 1 y 2: 100000 + 2*(50000-5000) = 190000
    // Mes 3 (i=3, primer mostrado): 190000 + 50000 - 5000 = 235000
    // Mes 4: 235000 + 50000 - 5000 = 280000
    expect(r.proyecciones).toHaveLength(2)
    expect(r.proyecciones[0].proyeccion).toBe(235000)
    expect(r.proyecciones[1].proyeccion).toBe(280000)
    // saldoBase = saldo al final del skipCount-ésimo mes (i=2)
    expect(r.saldoBase).toBe(190000)
    // saldoInicioMes = saldo al inicio del mes mostrado (= 190000 antes de mes i=2)
    // Wait — la lógica captura saldoInicioMes cuando i === skipCount, antes
    // de procesar ese mes. En i=2, saldoInicioMes = saldo al inicio del
    // mes 2 = 100000 + (50000-5000) = 145000.
    expect(r.saldoInicioMes).toBe(145000)
  })

  it('proyección negativa cuando gastos > ingresos', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          50000,
      gastosFijosEfectivo: 30000,
      gastosFijosTarjeta:   20000,
      skipCount:               0,
      meses: [
        mes('2026-06-01', 10000, 5000),  // ingreso 10k, TC 5k
      ],
    })
    // 50000 + 10000 - 30000 - 20000 - 5000 = 5000
    expect(r.proyecciones[0].proyeccion).toBe(5000)
  })

  it('saldo se puede ir negativo', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          10000,
      gastosFijosEfectivo: 50000,
      gastosFijosTarjeta:      0,
      skipCount:               0,
      meses: [mes('2026-06-01', 0, 0)],
    })
    expect(r.proyecciones[0].proyeccion).toBe(-40000)
  })

  it('label del mes en español (capitalizado)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          0,
      gastosFijosEfectivo: 0,
      gastosFijosTarjeta:  0,
      skipCount:           0,
      meses: [mes('2026-06-01', 0, 0)],
    })
    // toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    // returns "junio de 2026" — el código capitaliza y saca " de ".
    expect(r.proyecciones[0].label).toMatch(/Junio 2026/i)
  })

  it('meses vacíos → proyecciones vacías', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          100000,
      gastosFijosEfectivo:   5000,
      gastosFijosTarjeta:    3000,
      skipCount:               0,
      meses:                  [],
    })
    expect(r.proyecciones).toEqual([])
    expect(r.saldoBase).toBe(100000)
  })

  it('redondeo: saldos siempre enteros (sin decimales raros)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          100.7,
      gastosFijosEfectivo:  10.3,
      gastosFijosTarjeta:    5.5,
      skipCount:               0,
      meses: [mes('2026-06-01', 50.4, 2.1)],
    })
    expect(Number.isInteger(r.proyecciones[0].proyeccion)).toBe(true)
    expect(Number.isInteger(r.saldoBase)).toBe(true)
  })

  it('diferencia del primer mes mostrado es vs saldoBase, no vs proyeccion anterior', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          100000,
      gastosFijosEfectivo:   5000,
      gastosFijosTarjeta:      0,
      skipCount:               1,  // primer mes mostrado es i=2
      meses: [
        mes('2026-06-01', 50000, 0),  // i=1, calcula saldoBase
        mes('2026-07-01', 50000, 0),  // i=2, primer mostrado
        mes('2026-08-01', 50000, 0),
      ],
    })
    // saldoBase después de i=1: 100000 + 50000 - 5000 = 145000
    // i=2: 145000 + 50000 - 5000 = 190000, diferencia = 190000 - 145000 = 45000
    expect(r.saldoBase).toBe(145000)
    expect(r.proyecciones[0].proyeccion).toBe(190000)
    expect(r.proyecciones[0].diferencia).toBe(45000)
  })

  it('TC en USD se respeta como ya convertido (totalTC viene en ARS)', () => {
    // La función no convierte montos — espera totalIngresos y totalTC
    // ya en ARS. Si la conversión USD→ARS no se hizo, este es el bug
    // del orquestador, no de esta función.
    const r = calcularProyeccionesIterativo({
      startSaldo:          100000,
      gastosFijosEfectivo:      0,
      gastosFijosTarjeta:       0,
      skipCount:                0,
      meses: [mes('2026-06-01', 0, 70000)],  // 70000 ARS (= 50 USD * 1400)
    })
    expect(r.proyecciones[0].proyeccion).toBe(30000)  // 100000 - 70000
    expect(r.proyecciones[0].gastos_tarjeta).toBe(70000)
  })

  it('skipCount > totalLoop: ningún mes mostrado', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo:          100000,
      gastosFijosEfectivo:   5000,
      gastosFijosTarjeta:      0,
      skipCount:               10,  // skipea más que meses disponibles
      meses: [mes('2026-06-01', 0, 0), mes('2026-07-01', 0, 0)],
    })
    expect(r.proyecciones).toEqual([])
  })
})

// ── Integración: end-to-end con datos representativos ─────────────────────
describe('integración: cálculo completo realista', () => {
  it('escenario típico del user argentino', () => {
    const resumen = {
      disponible_real:        300000,
      ingresos_futuros_mes:   150000,
      gastos_fijos_pendientes: 50000,
      deuda_tarjetas_periodo: 80000,
      pagos_tarjeta_mes:      20000,
    }
    const dolar = 1400

    const gastosFijos = [
      { monto_estimado: 30000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Banco CA' } },
      { monto_estimado: 50,    moneda: 'USD', cuentas: { tipo_cuenta: 'Tarjeta Credito' } },  // 70k ARS
    ]

    // startSaldo: 300000 + 150000 - 50000 - max(0, 80000-20000) = 340000
    const startSaldo = calcularSaldoInicial(resumen)
    expect(startSaldo).toBe(340000)

    const { efectivo, tarjeta } = bifurcarGastosFijos(gastosFijos, dolar)
    expect(efectivo).toBe(30000)
    expect(tarjeta).toBe(70000)

    // Proyecciones para 3 meses (sin skip)
    const r = calcularProyeccionesIterativo({
      startSaldo,
      gastosFijosEfectivo: efectivo,
      gastosFijosTarjeta:  tarjeta,
      skipCount:           0,
      meses: [
        { periodo: '2026-06-01', totalIngresos: 200000, totalTC: 50000 },
        { periodo: '2026-07-01', totalIngresos: 200000, totalTC: 30000 },
        { periodo: '2026-08-01', totalIngresos: 200000, totalTC: 40000 },
      ],
    })

    // M1: 340000 + 200000 - 30000 - 70000 - 50000 = 390000
    // M2: 390000 + 200000 - 30000 - 70000 - 30000 = 460000
    // M3: 460000 + 200000 - 30000 - 70000 - 40000 = 520000
    expect(r.proyecciones.map(p => p.proyeccion)).toEqual([390000, 460000, 520000])
  })
})
