'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CuentaMovimientosTable } from '@/components/cuenta-movimientos-table'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Mov = {
  id: string; fecha: string; detalle: string | null
  monto: number; monto_estimado: number | null; tipo_movimiento: string
  cuenta_origen: string; cuenta_destino: string | null
  categoria_icono: string | null; categoria_nombre: string | null
  periodo_tarjeta: string | null; cuotas_total: number; cuota_actual: number
}
type Categoria    = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }
type CuentaItem   = { id: string; nombre_cuenta: string }

export function CuentaSaldoReactivo({ movimientos, cuentaId, categorias, subcategorias, saldoInicial, moneda, isTarjeta, colorPrim, textoClaro, cierre, vence, cuentas }: {
  movimientos: Mov[]; cuentaId: string; categorias: Categoria[]; subcategorias: Subcategoria[]
  saldoInicial: number; moneda: string; isTarjeta: boolean
  colorPrim: string; textoClaro: boolean; cierre?: number | null; vence?: number | null
  cuentas?: CuentaItem[]
}) {
  const [movs, setMovs] = useState(movimientos)
  const [saldoActual, setSaldoActual] = useState(saldoInicial)

  const handleNuevoMovimiento = (nuevos: Mov[]) => {
    // Agregar todos los nuevos (cuotas) al estado interno
    setMovs(prev => [...nuevos, ...prev])
    // Solo el primero afecta el saldo visible (la cuota 1 es la que impacta ahora)
    const primer = nuevos[0]
    if (!primer) return
    const monto     = primer.monto_estimado ?? primer.monto
    const esDestino = primer.cuenta_destino === cuentaId
    let delta = 0
    if (primer.tipo_movimiento === 'Ingreso')        delta = monto
    else if (primer.tipo_movimiento === 'Gasto')     delta = -monto
    else if (primer.tipo_movimiento === 'Transferencia')
      delta = esDestino ? monto : -monto
    setSaldoActual(prev => prev + delta)
  }

  const textColor = textoClaro ? 'white' : '#1e293b'
  const textMuted = textoClaro ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'

  return (
    <>
      {/* Saldo en el banner */}
      <div className="text-center px-6 pb-6">
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: textMuted }}>
          {isTarjeta ? 'Saldo acumulado' : 'Saldo actual'}
        </p>
        <p className="text-4xl font-bold" style={{ color: textColor }}>
          {moneda === 'USD' ? 'US$' : '$'}{fmt(saldoActual)}
        </p>
        {isTarjeta && cierre && vence && (
          <p className="text-xs mt-3" style={{ color: textMuted }}>
            Cierre día {cierre} · Vencimiento día {vence}
          </p>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Movimientos ({movs.length})
          </p>
          <Link href={`/movimientos?cuenta=${cuentaId}`} className="text-xs text-blue-500 hover:text-blue-700 underline">
            Ver todos
          </Link>
        </div>
        <div className="px-5 py-4">
          <CuentaMovimientosTable
            movimientos={movs}
            cuentaId={cuentaId}
            categorias={categorias}
            subcategorias={subcategorias}
            isTarjeta={isTarjeta}
            cierreDay={cierre ?? null}
            venceDay={vence ?? null}
            cuentas={cuentas}
            onMovimientoAgregado={handleNuevoMovimiento}
          />
        </div>
      </div>
    </>
  )
}
