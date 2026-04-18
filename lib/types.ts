export type Moneda = 'ARS' | 'USD'
export type TipoCuenta = 'Billetera/Banco' | 'Tarjeta Credito' | 'Efectivo'
export type TipoMovimiento = 'Gasto' | 'Ingreso' | 'Transferencia'

export interface Cuenta {
  id: string
  nombre_cuenta: string
  institucion: string | null
  moneda: Moneda
  tipo_cuenta: TipoCuenta
  saldo_inicial: number
  fecha_cierre_tarjeta: string | null    // YYYY-MM-DD
  fecha_vencimiento_tarjeta: string | null
  activa: boolean
}

export interface Categoria {
  id: string
  nombre_categoria: string
  tipo_default: TipoMovimiento
  icono: string | null
}

export interface Subcategoria {
  id: string
  categoria_padre: string | null
  nombre_subcategoria: string
}

export interface Movimiento {
  id: string
  fecha: string              // YYYY-MM-DD
  detalle: string | null
  categoria: string | null
  subcategoria: string | null
  monto: number
  moneda: Moneda
  tipo_movimiento: TipoMovimiento
  cuenta_origen: string | null
  cuenta_destino: string | null
  cotizacion: number | null
  periodo_tarjeta: string | null  // YYYY-MM-DD (siempre día 01)
  conciliado: boolean
  notas: string | null
  cuotas_total: number
  cuota_actual: number
  ciclo_actual: number
}

export interface GastoFijo {
  id: string
  nombre_gasto: string
  id_categoria: string | null
  monto_estimado: number
  moneda: Moneda
  dia_vencimiento: number | null
  cuenta_pago_default: string | null
  activo: boolean
}

export interface Parametro {
  id: string
  valor: number
  fecha: string
}

// Movimiento con joins (de la vista movimientos_completos)
export interface MovimientoCompleto extends Movimiento {
  monto_estimado: number
  categoria_nombre: string | null
  categoria_icono: string | null
  cuenta_origen_nombre: string | null
  cuenta_origen_tipo: TipoCuenta | null
  cuenta_destino_nombre: string | null
}