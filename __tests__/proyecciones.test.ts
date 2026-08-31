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
  resumirMesProyeccion,
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

// ── resumirMesProyeccion ───────────────────────────────────────────────────
describe('resumirMesProyeccion', () => {
  const tarjetaIds = new Set(['tc1'])
  const base = { periodo: '2026-11-01', tarjetaIds, dolar: 1400 }
  const gfGas  = { id: 'gf-gas',  monto_estimado: 80000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Tarjeta Credito' } }
  const gfAlq  = { id: 'gf-alq',  monto_estimado: 500000, moneda: 'ARS', cuentas: { tipo_cuenta: 'Banco' } }
  const movTC  = (over = {}) => ({ tipo_movimiento: 'Gasto', monto: 10000, monto_estimado: 10000, moneda: 'ARS', cuenta_origen: 'tc1', gasto_fijo_id: null, ...over })

  it('separa TC / otros / ingresos y computa gastos fijos pendientes', () => {
    const r = resumirMesProyeccion({ ...base,
      movs: [
        movTC(),                                                          // gasto tarjeta
        movTC({ cuenta_origen: 'banco', monto_estimado: 7000 }),          // gasto NO tarjeta (cuota en banco)
        movTC({ tipo_movimiento: 'Ingreso', cuenta_origen: 'banco', monto_estimado: 90000 }), // ingreso cash
      ],
      gastosFijos: [gfGas, gfAlq],
    })
    expect(r.totalTC).toBe(10000)
    expect(r.totalOtrosGastos).toBe(7000)          // antes estas cuotas se PERDÍAN
    expect(r.totalIngresos).toBe(90000)
    expect(r.gfTarjetaPendiente).toBe(80000)
    expect(r.gfEfectivoPendiente).toBe(500000)
  })

  it('un gasto fijo con movimiento VINCULADO no se cuenta dos veces', () => {
    // Regresión del doble conteo: el consumo de Camuzzi ya entró como
    // movimiento (linkeado) → el gasto fijo "Gas" NO se resta aparte.
    const r = resumirMesProyeccion({ ...base,
      movs: [movTC({ monto_estimado: 81000, gasto_fijo_id: 'gf-gas' })],
      gastosFijos: [gfGas, gfAlq],
    })
    expect(r.totalTC).toBe(81000)                  // el consumo real cuenta
    expect(r.gfTarjetaPendiente).toBe(0)           // el estimado ya NO
    expect(r.gfEfectivoPendiente).toBe(500000)     // el alquiler sigue pendiente
  })

  it('un reintegro de tarjeta RESTA del pago de tarjeta (no suma como cash)', () => {
    const r = resumirMesProyeccion({ ...base,
      movs: [
        movTC({ monto_estimado: 50000 }),
        movTC({ tipo_movimiento: 'Ingreso', monto_estimado: 8000 }),      // reintegro en tc1
      ],
      gastosFijos: [],
    })
    expect(r.totalTC).toBe(42000)
    expect(r.totalIngresos).toBe(0)
  })

  it('sin monto_estimado usa moneda+dolar (fallback)', () => {
    const r = resumirMesProyeccion({ ...base,
      movs: [movTC({ monto: 50, moneda: 'USD', monto_estimado: null })],
      gastosFijos: [],
    })
    expect(r.totalTC).toBe(70000)
  })

  it('gasto fijo en USD se convierte con el dolar', () => {
    const r = resumirMesProyeccion({ ...base,
      movs: [],
      gastosFijos: [{ id: 'gf-usd', monto_estimado: 100, moneda: 'USD', cuentas: { tipo_cuenta: 'Banco' } }],
    })
    expect(r.gfEfectivoPendiente).toBe(140000)
  })
})

// ── calcularProyeccionesIterativo ──────────────────────────────────────────
describe('calcularProyeccionesIterativo', () => {
  // Setup helper: el "mes data" pre-agregado para el cálculo
  function mes(periodo: string, totalIngresos = 0, totalTC = 0, gfE = 0, gfT = 0, otros = 0) {
    return {
      periodo, totalIngresos, totalTC,
      totalOtrosGastos: otros,
      gfEfectivoPendiente: gfE,
      gfTarjetaPendiente: gfT,
    }
  }

  it('escenario simple: 3 meses adelante con ingresos+gastos fijos+TC', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 100000,
      skipCount:  0,
      meses: [
        mes('2026-06-01', 50000, 10000, 5000, 3000),
        mes('2026-07-01', 50000, 8000,  5000, 3000),
        mes('2026-08-01', 50000, 12000, 5000, 3000),
      ],
    })
    // Mes 1: 100000 + 50000 - 5000 - 3000 - 10000 = 132000
    // Mes 2: 132000 + 50000 - 5000 - 3000 - 8000  = 166000
    // Mes 3: 166000 + 50000 - 5000 - 3000 - 12000 = 196000
    expect(r.proyecciones.map(p => p.proyeccion)).toEqual([132000, 166000, 196000])
    expect(r.proyecciones[0].diferencia).toBe(32000)
    expect(r.proyecciones[0].gastos_fijos).toBe(8000)   // publica LO QUE RESTÓ (efectivo+tarjeta)
  })

  it('los gastos fijos pueden variar POR MES (pendientes vs vinculados)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 100000,
      skipCount:  0,
      meses: [
        mes('2026-09-01', 0, 50000, 5000, 0),      // septiembre: el consumo ya entró → gfT pendiente 0
        mes('2026-10-01', 0, 0,     5000, 40000),  // octubre: todavía nada cargado → gfT completo
      ],
    })
    // Sep: 100000 - 5000 - 50000 = 45000  |  Oct: 45000 - 5000 - 40000 = 0
    expect(r.proyecciones.map(p => p.proyeccion)).toEqual([45000, 0])
  })

  it('las cuotas en cuentas no-tarjeta restan (antes se perdían)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 100000,
      skipCount:  0,
      meses: [mes('2026-06-01', 0, 0, 0, 0, 30000)],
    })
    expect(r.proyecciones[0].proyeccion).toBe(70000)
    expect(r.proyecciones[0].gastos_otros).toBe(30000)
  })

  it('escenario con skipCount=2 (los primeros 2 meses se descartan)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 100000,
      skipCount:  2,
      meses: [
        mes('2026-06-01', 50000, 0, 5000, 0),
        mes('2026-07-01', 50000, 0, 5000, 0),
        mes('2026-08-01', 50000, 0, 5000, 0),
        mes('2026-09-01', 50000, 0, 5000, 0),
      ],
    })
    expect(r.proyecciones).toHaveLength(2)
    expect(r.proyecciones[0].proyeccion).toBe(235000)
    expect(r.proyecciones[1].proyeccion).toBe(280000)
    expect(r.saldoBase).toBe(190000)
    expect(r.saldoInicioMes).toBe(145000)
  })

  it('saldo se puede ir negativo', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 10000,
      skipCount:  0,
      meses: [mes('2026-06-01', 0, 0, 50000, 0)],
    })
    expect(r.proyecciones[0].proyeccion).toBe(-40000)
  })

  it('label del mes en español (capitalizado)', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 0, skipCount: 0,
      meses: [mes('2026-06-01')],
    })
    expect(r.proyecciones[0].label).toMatch(/Junio 2026/i)
  })

  it('meses vacíos → proyecciones vacías', () => {
    const r = calcularProyeccionesIterativo({ startSaldo: 100000, skipCount: 0, meses: [] })
    expect(r.proyecciones).toEqual([])
    expect(r.saldoBase).toBe(100000)
  })

  it('redondeo: saldos siempre enteros', () => {
    const r = calcularProyeccionesIterativo({
      startSaldo: 100.7, skipCount: 0,
      meses: [mes('2026-06-01', 50.4, 2.1, 10.3, 5.5)],
    })
    expect(Number.isInteger(r.proyecciones[0].proyeccion)).toBe(true)
    expect(Number.isInteger(r.saldoBase)).toBe(true)
  })
})
