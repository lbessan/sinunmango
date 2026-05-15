// Tipos string-literal del dominio. La DB los guarda como `text` pero acá
// los modelamos como union para que el código tenga seguridad de tipos.
//
// Las shapes completas (Movimiento, Cuenta, etc.) vienen de la auto-gen
// en `database.types.ts`. Acceder via:
//   import type { Database } from '@/lib/database.types'
//   type Movimiento = Database['public']['Tables']['movimientos']['Row']

export type Moneda         = 'ARS' | 'USD'
export type TipoCuenta     = 'Banco CA' | 'Banco CC' | 'Billetera' | 'Efectivo' | 'Tarjeta Credito'
export type TipoMovimiento = 'Gasto' | 'Ingreso' | 'Transferencia'
