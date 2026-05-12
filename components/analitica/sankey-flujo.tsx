'use client'

// ─── Sankey diagram: Income sources → Expense categories ─────────────────────
//
// Layout con d3-sankey, render SVG hand-rolled para mantener el look.
//
// 3 niveles:
//   - Izquierda: fuentes de ingreso (cuentas donde entró plata)
//   - Centro:    "Mi plata" (nodo agregador invisible-ish)
//   - Derecha:   categorías de gasto + "Ahorrado" (o "Déficit")

import { useMemo, useId, useState } from 'react'
import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey'
import { fmt, fmtK, montoOf, type MovAnalitica } from './utils'

const COL_INCOME    = '#1a6b5a'
const COL_POOL      = '#475569'   // slate-600
const COL_SAVINGS   = '#0891b2'   // emerald-cyan
const COL_DEFICIT   = '#dc2626'   // red
const PALETA_CATS   = [
  '#1B3A6B', '#d97706', '#7c3aed', '#0891b2',
  '#be185d', '#059669', '#dc2626', '#6366f1',
  '#f59e0b', '#0284c7', '#16a34a', '#9333ea',
  '#ea580c', '#0d9488',
]

type Node = { id: string; nombre: string; type: 'source' | 'pool' | 'sink'; color: string; total: number }
type Link = { source: string; target: string; value: number }

export function SankeyFlujo({ movs }: { movs: MovAnalitica[] }) {
  // Hover (resalta links que tocan el nodo)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Datos
  const { nodes, links, totalIngresos, totalGastos, neto } = useMemo(() => {
    const ingresos = movs.filter(m => m.tipo_movimiento === 'Ingreso')
    const gastos   = movs.filter(m => m.tipo_movimiento === 'Gasto')

    const fuentes: Record<string, number> = {}
    ingresos.forEach(m => {
      const k = m.cuenta_origen_nombre ?? 'Sin cuenta'
      fuentes[k] = (fuentes[k] ?? 0) + montoOf(m)
    })

    const categorias: Record<string, number> = {}
    gastos.forEach(m => {
      const k = m.categoria_nombre ?? 'Sin categoría'
      categorias[k] = (categorias[k] ?? 0) + montoOf(m)
    })

    const totalIngresos = Object.values(fuentes).reduce((a, v) => a + v, 0)
    const totalGastos   = Object.values(categorias).reduce((a, v) => a + v, 0)
    const neto          = totalIngresos - totalGastos

    const fuentesList = Object.entries(fuentes).sort((a, b) => b[1] - a[1])
    const catsList    = Object.entries(categorias).sort((a, b) => b[1] - a[1])

    const ns: Node[] = []
    const ls: Link[] = []

    fuentesList.forEach(([nombre, total]) => {
      ns.push({ id: `f:${nombre}`, nombre, type: 'source', color: COL_INCOME, total })
      if (totalIngresos > 0) {
        ls.push({ source: `f:${nombre}`, target: '__pool__', value: total })
      }
    })

    if (totalIngresos > 0 || totalGastos > 0) {
      ns.push({ id: '__pool__', nombre: 'Mi plata', type: 'pool', color: COL_POOL, total: totalIngresos })
    }

    catsList.forEach(([nombre, total], i) => {
      ns.push({ id: `c:${nombre}`, nombre, type: 'sink', color: PALETA_CATS[i % PALETA_CATS.length], total })
      ls.push({ source: '__pool__', target: `c:${nombre}`, value: total })
    })

    if (neto > 0) {
      ns.push({ id: '__ahorrado__', nombre: 'Ahorrado', type: 'sink', color: COL_SAVINGS, total: neto })
      ls.push({ source: '__pool__', target: '__ahorrado__', value: neto })
    } else if (neto < 0) {
      // Déficit: gastaste más de lo que entró. El sankey necesita link balance, así que
      // creamos un "source" de déficit que alimenta al pool, para cuadrar valores.
      ns.unshift({ id: '__deficit__', nombre: 'Déficit (gastaste de saldo previo)', type: 'source', color: COL_DEFICIT, total: -neto })
      ls.unshift({ source: '__deficit__', target: '__pool__', value: -neto })
    }

    return { nodes: ns, links: ls, totalIngresos, totalGastos, neto }
  }, [movs])

  // Sankey layout
  const W = 900
  const H = Math.max(360, nodes.length * 28)
  const PAD = 18

  const graph = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null
    const layout = sankey<Node, Link>()
      .nodeId(d => d.id)
      .nodeWidth(14)
      .nodePadding(14)
      .nodeAlign(sankeyJustify)
      .extent([[PAD, PAD], [W - PAD, H - PAD]])

    return layout({
      nodes: nodes.map(n => ({ ...n })),
      links: links.map(l => ({ ...l })),
    })
  }, [nodes, links])

  const gradId = useId().replace(/:/g, '')

  if (!graph) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
        <p className="text-sm text-slate-500">Sin datos suficientes para construir el flujo</p>
      </div>
    )
  }

  const isHighlighted = (sourceId: string, targetId: string) => {
    if (!hoveredNode) return true
    return sourceId === hoveredNode || targetId === hoveredNode
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-700">Flujo de la plata</p>
        <p className="text-xs text-slate-400 mt-0.5">
          De dónde entró ($
          {fmtK(totalIngresos)}) → cómo se distribuyó (${fmtK(totalGastos)} gastos
          {neto > 0 ? ` + $${fmtK(neto)} ahorrado` : neto < 0 ? ` · déficit $${fmtK(-neto)}` : ''})
          {' · '}pasá el mouse sobre nodos para resaltar
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 700, height: H }}>
          {/* Links */}
          {graph.links.map((link, i) => {
            const s = typeof link.source === 'object' ? (link.source as unknown as Node & { x1: number }).id : ''
            const t = typeof link.target === 'object' ? (link.target as unknown as Node & { x0: number }).id : ''
            const sourceNode = link.source as unknown as Node & { x0: number; x1: number; y0: number; y1: number }
            const targetNode = link.target as unknown as Node & { x0: number; x1: number; y0: number; y1: number }
            const linkColor = targetNode.color
            const highlighted = isHighlighted(s, t)
            const path = sankeyLinkHorizontal()(link as any) ?? ''
            return (
              <path
                key={i}
                d={path}
                stroke={linkColor}
                strokeWidth={Math.max(1, link.width ?? 1)}
                fill="none"
                opacity={highlighted ? 0.45 : 0.08}
                style={{ transition: 'opacity 0.15s' }}
              >
                <title>
                  {sourceNode.nombre} → {targetNode.nombre}: ${fmt(link.value)}
                </title>
              </path>
            )
          })}

          {/* Nodes */}
          {graph.nodes.map(n => {
            const node = n as Node & { x0: number; x1: number; y0: number; y1: number }
            const dim = hoveredNode !== null && hoveredNode !== node.id
            const labelLeft = node.type === 'source' || node.type === 'pool' && node.id === '__pool__'
            // Para "pool" lo ponemos a la derecha del nodo (centrado mejor)
            const isPool = node.id === '__pool__'
            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer', opacity: dim ? 0.4 : 1, transition: 'opacity 0.15s' }}
              >
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={(node.x1 ?? 0) - (node.x0 ?? 0)}
                  height={(node.y1 ?? 0) - (node.y0 ?? 0)}
                  fill={node.color}
                  rx="2"
                />
                {/* Label */}
                {isPool ? (
                  <text
                    x={(node.x0 + node.x1) / 2}
                    y={node.y0 - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="#334155"
                  >
                    {node.nombre} · ${fmtK(node.total)}
                  </text>
                ) : node.type === 'source' ? (
                  <text
                    x={node.x1 + 6}
                    y={(node.y0 + node.y1) / 2}
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#334155"
                  >
                    <tspan fontWeight="600">{node.nombre}</tspan>
                    <tspan dx="6" fill="#94a3b8">${fmtK(node.total)}</tspan>
                  </text>
                ) : (
                  <text
                    x={node.x0 - 6}
                    y={(node.y0 + node.y1) / 2}
                    dominantBaseline="middle"
                    textAnchor="end"
                    fontSize="11"
                    fill="#334155"
                  >
                    <tspan fill="#94a3b8">${fmtK(node.total)} </tspan>
                    <tspan fontWeight="600">{node.nombre}</tspan>
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
