// @vitest-environment happy-dom
//
// Tests para components/cuenta-saldo-reactivo.tsx
//
// Componente del detail de cuenta que muestra saldo + tabla de movs,
// y se actualiza reactivamente cuando el user carga un nuevo mov sin
// recargar la página. La lógica clave es handleNuevoMovimiento:
//   - Ingreso suma
//   - Gasto resta
//   - Transferencia: sumar si soy destino, restar si soy origen
//   - Cuotas: solo el primer mov afecta saldo (no multiplica por N)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { CuentaSaldoReactivo } from '@/components/cuenta-saldo-reactivo'
import { ComponentProps } from 'react'

// Mock del child CuentaMovimientosTable — no nos interesa renderearlo
// real; lo usamos como vehículo para invocar onMovimientoAgregado en
// el test, exponiéndolo en window para testabilidad.
type TableProps = {
  onMovimientoAgregado?: (movs: unknown[]) => void
  movimientos?: unknown[]
}
vi.mock('@/components/cuenta-movimientos-table', () => ({
  CuentaMovimientosTable: (props: TableProps) => {
    // Exponemos el handler para que el test pueda invocarlo
    ;(globalThis as { __onMovAgregado?: TableProps['onMovimientoAgregado'] }).__onMovAgregado = props.onMovimientoAgregado
    return <div data-testid="movs-table">{props.movimientos?.length} movs</div>
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

type Mov = ComponentProps<typeof CuentaSaldoReactivo>['movimientos'][number]

const CUENTA_ID = 'cta_1'

function makeMov(overrides: Partial<Mov> = {}): Mov {
  return {
    id: 'm1', fecha: '2026-05-25', detalle: 'Test', monto: 1000,
    monto_estimado: 1000, tipo_movimiento: 'Gasto',
    cuenta_origen: CUENTA_ID, cuenta_destino: null,
    categoria_icono: null, categoria_nombre: null,
    periodo_tarjeta: null, cuotas_total: 1, cuota_actual: 1,
    ...overrides,
  } as Mov
}

const DEFAULT_PROPS: ComponentProps<typeof CuentaSaldoReactivo> = {
  movimientos: [],
  cuentaId: CUENTA_ID,
  categorias: [],
  subcategorias: [],
  saldoInicial: 10_000,
  moneda: 'ARS',
  isTarjeta: false,
  colorPrim: '#0d3b6e',
  textoClaro: true,
}

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
  ;(globalThis as { __onMovAgregado?: unknown }).__onMovAgregado = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

function getMovAgregado(): (movs: Mov[]) => void {
  const fn = (globalThis as { __onMovAgregado?: (movs: Mov[]) => void }).__onMovAgregado
  if (!fn) throw new Error('onMovimientoAgregado no expuesto')
  return fn
}

describe('CuentaSaldoReactivo — render', () => {
  it('renderea saldo inicial formateado', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={12345.67} />)
    expect(screen.getByText('$12.345,67')).toBeTruthy()
  })

  it('USD usa prefijo US$', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} moneda="USD" saldoInicial={100} />)
    expect(screen.getByText('US$100,00')).toBeTruthy()
  })

  it('cuenta normal → "Saldo actual"', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} isTarjeta={false} />)
    expect(screen.getByText('Saldo actual')).toBeTruthy()
  })

  it('tarjeta → "Saldo acumulado"', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} isTarjeta={true} />)
    expect(screen.getByText('Saldo acumulado')).toBeTruthy()
  })

  it('isTarjeta con cierre+vence → muestra "Cierre día X · Vencimiento día Y"', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} isTarjeta={true} cierre={25} vence={10} />)
    expect(screen.getByText(/Cierre día 25/)).toBeTruthy()
    expect(screen.getByText(/Vencimiento día 10/)).toBeTruthy()
  })

  it('isTarjeta sin cierre/vence → no muestra esa línea', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} isTarjeta={true} />)
    expect(screen.queryByText(/Cierre día/)).toBeNull()
  })

  it('count de movimientos visible', () => {
    const movs = [makeMov({ id: 'm1' }), makeMov({ id: 'm2' })]
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} movimientos={movs} />)
    expect(screen.getByText(/Movimientos \(2\)/)).toBeTruthy()
  })
})

describe('CuentaSaldoReactivo — saldo reactivo', () => {
  it('nuevo Ingreso → saldo aumenta', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([makeMov({ tipo_movimiento: 'Ingreso', monto: 5000, monto_estimado: 5000 })])
    })
    expect(screen.getByText('$15.000,00')).toBeTruthy()
  })

  it('nuevo Gasto → saldo baja', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([makeMov({ tipo_movimiento: 'Gasto', monto: 3000, monto_estimado: 3000 })])
    })
    expect(screen.getByText('$7.000,00')).toBeTruthy()
  })

  it('Transferencia con esta cuenta como ORIGEN → resta', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([makeMov({
        tipo_movimiento: 'Transferencia',
        cuenta_origen: CUENTA_ID, cuenta_destino: 'cta_2',
        monto: 2000, monto_estimado: 2000,
      })])
    })
    expect(screen.getByText('$8.000,00')).toBeTruthy()
  })

  it('Transferencia con esta cuenta como DESTINO → suma', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([makeMov({
        tipo_movimiento: 'Transferencia',
        cuenta_origen: 'cta_2', cuenta_destino: CUENTA_ID,
        monto: 2500, monto_estimado: 2500,
      })])
    })
    expect(screen.getByText('$12.500,00')).toBeTruthy()
  })

  it('múltiples cuotas → solo la primera afecta saldo (no se multiplica)', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([
        makeMov({ id: 'c1', tipo_movimiento: 'Gasto', monto: 500, monto_estimado: 500, cuotas_total: 3, cuota_actual: 1 }),
        makeMov({ id: 'c2', tipo_movimiento: 'Gasto', monto: 500, monto_estimado: 500, cuotas_total: 3, cuota_actual: 2 }),
        makeMov({ id: 'c3', tipo_movimiento: 'Gasto', monto: 500, monto_estimado: 500, cuotas_total: 3, cuota_actual: 3 }),
      ])
    })
    // 10000 - 500 = 9500 (no 8500)
    expect(screen.getByText('$9.500,00')).toBeTruthy()
  })

  it('monto_estimado se usa en preferencia a monto si está disponible', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([makeMov({
        tipo_movimiento: 'Gasto',
        monto: 1000, monto_estimado: 1234,  // estimado distinto al raw
      })])
    })
    expect(screen.getByText('$8.766,00')).toBeTruthy()  // 10000 - 1234
  })

  it('lista de movs se actualiza con el nuevo (los nuevos van primero)', () => {
    const initial = [makeMov({ id: 'm_old' })]
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} movimientos={initial} />)
    expect(screen.getByText(/Movimientos \(1\)/)).toBeTruthy()

    act(() => {
      getMovAgregado()([makeMov({ id: 'm_new', tipo_movimiento: 'Ingreso', monto: 100, monto_estimado: 100 })])
    })

    expect(screen.getByText(/Movimientos \(2\)/)).toBeTruthy()
  })

  it('handler con array vacío no rompe (early return)', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} saldoInicial={10000} />)
    act(() => {
      getMovAgregado()([])
    })
    // Saldo no cambia
    expect(screen.getByText('$10.000,00')).toBeTruthy()
  })
})

describe('CuentaSaldoReactivo — link "Ver todos"', () => {
  it('link apunta a /movimientos con filter de cuenta', () => {
    render(<CuentaSaldoReactivo {...DEFAULT_PROPS} cuentaId="cta_xyz" />)
    const link = screen.getByText('Ver todos').closest('a')
    expect(link?.getAttribute('href')).toBe('/movimientos?cuenta=cta_xyz')
  })
})
