'use client'

// ─── Cash flow waterfall ─────────────────────────────────────────────────────
//
// Visualiza el flujo lineal:
//   Saldo inicial (0 si no se sabe) → +Ingresos → −Categoría 1 → −Categoría 2 → ... → Resultado neto
//
// Cada paso es una barra que se construye sobre el saldo acumulado anterior.

import { useMemo } from 'react'
import { fmt, fmtK, montoOf, type MovAnalitica } from './utils'

type Paso = {
  label:    string
  delta:    number    // + para ingreso, - para gasto
  saldo:    number    // saldo después del paso
  color:    string
  type:     'inicial' | 'ingreso' | 'gasto' | 'final'
}

export function WaterfallFlujo({ movs }: { movs: MovAnalitica[] }) {
  const pasos = useMemo<Paso[]>(() => {
    const ingresos = movs.filter(m => m.tipo_movimiento === 'Ingreso')
    const gastos   = movs.filter(m => m.tipo_movimiento === 'Gasto')

    const totalIngresos = ingresos.reduce((a, m) => a + montoOf(m), 0)

    // Categorías de gasto agrupadas
    const catMap: Record<string, number> = {}
    gastos.forEach(m => {
      const k = m.categoria_nombre ?? 'Sin categoría'
      catMap[k] = (catMap[k] ?? 0) + montoOf(m)
    })
    // Top 6 categorías + "Otras"
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])
    const top6   = sorted.slice(0, 6)
    const otras  = sorted.slice(6).reduce((a, [, v]) => a + v, 0)

    let saldo = 0
    const out: Paso[] = []
    out.push({ label: 'Inicio', delta: 0, saldo, color: '#94a3b8', type: 'inicial' })

    if (totalIngresos > 0) {
      saldo += totalIngresos
      out.push({ label: 'Ingresos', delta: totalIngresos, saldo, color: '#1a6b5a', type: 'ingreso' })
    }

    top6.forEach(([nombre, monto]) => {
      saldo -= monto
      out.push({ label: nombre, delta: -monto, saldo, color: '#dc2626', type: 'gasto' })
    })
    if (otras > 0) {
      saldo -= otras
      out.push({ label: 'Otras categorías', delta: -otras, saldo, color: '#dc2626', type: 'gasto' })
    }

    out.push({ label: 'Resultado', delta: 0, saldo, color: saldo >= 0 ? '#0891b2' : '#dc2626', type: 'final' })
    return out
  }, [movs])

  if (pasos.length <= 2) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <p className="text-sm font-semibold text-slate-700 mb-1">Cash flow del período</p>
        <p className="text-xs text-slate-400 py-6 text-center">Sin movimientos suficientes</p>
      </div>
    )
  }

  // Para escalar el SVG: valor máximo acumulado
  const maxSaldo = Math.max(...pasos.map(p => p.saldo), 0)
  const minSaldo = Math.min(...pasos.map(p => p.saldo), 0)
  const range    = maxSaldo - minSaldo || 1

  const W = 900
  const H = 280
  const PL = 16
  const PR = 16
  const PT = 30
  const PB = 60
  const cW = W - PL - PR
  const cH = H - PT - PB

  const barW = cW / pasos.length * 0.7
  const gap  = cW / pasos.length * 0.3
  const slot = barW + gap

  const yFor = (v: number) => PT + cH - ((v - minSaldo) / range) * cH

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <p className="text-sm font-semibold text-slate-700 mb-0.5">Cash flow waterfall</p>
      <p className="text-xs text-slate-400 mb-5">
        Cómo se construye el resultado neto: empezás en cero, los ingresos suben, los gastos bajan
      </p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 700, height: H }}>
          {/* Línea de cero */}
          {minSaldo < 0 && (
            <line x1={PL} y1={yFor(0)} x2={W - PR} y2={yFor(0)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
          )}

          {pasos.map((p, i) => {
            const x = PL + gap / 2 + i * slot
            const isStartOrEnd = p.type === 'inicial' || p.type === 'final'
            if (isStartOrEnd) {
              // Barra desde 0 hasta saldo final
              const y1 = yFor(0)
              const y2 = yFor(p.saldo)
              const yTop    = Math.min(y1, y2)
              const yHeight = Math.abs(y2 - y1)
              return (
                <g key={i}>
                  <rect x={x} y={yTop} width={barW} height={Math.max(yHeight, 2)} fill={p.color} opacity="0.85" />
                  {p.type === 'final' && (
                    <text
                      x={x + barW / 2}
                      y={yTop - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill={p.color}
                    >
                      ${fmtK(p.saldo)}
                    </text>
                  )}
                  <text
                    x={x + barW / 2}
                    y={H - PB + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                    fontWeight="600"
                  >
                    {p.label}
                  </text>
                </g>
              )
            }
            // Barras intermedias: desde saldoPrev hasta saldo
            const saldoPrev = pasos[i - 1].saldo
            const y1 = yFor(saldoPrev)
            const y2 = yFor(p.saldo)
            const yTop    = Math.min(y1, y2)
            const yHeight = Math.abs(y2 - y1)
            const isUp = p.delta > 0

            return (
              <g key={i}>
                {/* Linea horizontal conectando barras */}
                {i > 0 && (
                  <line
                    x1={x - gap}
                    y1={y1}
                    x2={x}
                    y2={y1}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="3 2"
                  />
                )}
                <rect x={x} y={yTop} width={barW} height={Math.max(yHeight, 2)} fill={p.color} opacity="0.85" />
                {/* Delta */}
                <text
                  x={x + barW / 2}
                  y={isUp ? yTop - 5 : yTop + yHeight + 12}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={p.color}
                >
                  {p.delta >= 0 ? '+' : '−'}${fmtK(Math.abs(p.delta))}
                </text>
                {/* Label */}
                <text
                  x={x + barW / 2}
                  y={H - PB + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#64748b"
                >
                  {truncate(p.label, 16)}
                </text>
                {/* Saldo acumulado */}
                <text
                  x={x + barW / 2}
                  y={H - PB + 28}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#94a3b8"
                >
                  ${fmtK(p.saldo)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
