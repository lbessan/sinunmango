'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X } from 'lucide-react'

type TourStep = {
  tourId: string
  title: string
  desc: string
  emoji: string
}

const STEPS: TourStep[] = [
  {
    tourId: 'tour-dashboard',
    title:  'Dashboard',
    desc:   'Acá ves el resumen de tus finanzas: saldo disponible, deuda de tarjetas y proyección de los próximos meses.',
    emoji:  '📊',
  },
  {
    tourId: 'tour-movimientos',
    title:  'Movimientos',
    desc:   'Registrá gastos e ingresos. Podés categorizar cada uno, adjuntar fotos de tickets y hacer transferencias entre cuentas.',
    emoji:  '💸',
  },
  {
    tourId: 'tour-cuentas',
    title:  'Cuentas',
    desc:   'Tus bancos, billeteras y efectivo. Cada cuenta muestra su saldo actualizado en tiempo real.',
    emoji:  '🏦',
  },
  {
    tourId: 'tour-tarjetas',
    title:  'Tarjetas de crédito',
    desc:   'Seguí el gasto acumulado de cada tarjeta por período. Ves cuánto debés y cuándo vence el próximo cierre.',
    emoji:  '💳',
  },
  {
    tourId: 'tour-manguito',
    title:  'Manguito',
    desc:   'Tu asistente financiero con IA. Preguntale en lenguaje natural: "¿cuánto gasté esta semana?" o "¿en qué estoy gastando más?".',
    emoji:  '🥭',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

export function TourOverlay({ onDone }: { onDone: () => void }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect]   = useState<Rect | null>(null)
  const router = useRouter()

  const step = STEPS[currentStep]

  const measureTarget = useCallback(() => {
    const el = document.querySelector(`[data-tour="${step.tourId}"]`)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    } else {
      setTargetRect(null)
    }
  }, [step.tourId])

  useEffect(() => {
    measureTarget()
    window.addEventListener('resize', measureTarget)
    return () => window.removeEventListener('resize', measureTarget)
  }, [measureTarget])

  const next = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      onDone()
    }
  }

  const skip = () => onDone()

  // Spotlight box dimensions with padding
  const PAD = 6
  const spotlight = targetRect
    ? {
        top:    targetRect.top    - PAD,
        left:   targetRect.left   - PAD,
        width:  targetRect.width  + PAD * 2,
        height: targetRect.height + PAD * 2,
      }
    : null

  // Tooltip positioning: prefer right of target, fallback to center
  const tooltipLeft = spotlight ? Math.min(spotlight.left + spotlight.width + 16, window.innerWidth - 320) : '50%'
  const tooltipTop  = spotlight
    ? Math.max(16, spotlight.top + spotlight.height / 2 - 100)
    : '50%'

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: 'auto' }}>
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.72)"
          mask="url(#spotlight-mask)"
        />
        {/* Highlight border */}
        {spotlight && (
          <rect
            x={spotlight.left}
            y={spotlight.top}
            width={spotlight.width}
            height={spotlight.height}
            rx={8}
            fill="none"
            stroke="var(--accent, #1a6b5a)"
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Tooltip card */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl p-5 w-72"
        style={{
          left: typeof tooltipLeft === 'number' ? tooltipLeft : undefined,
          top:  typeof tooltipTop  === 'number' ? tooltipTop  : undefined,
          transform: typeof tooltipLeft === 'string' ? 'translate(-50%, -50%)' : undefined,
        }}
      >
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === currentStep ? 20 : 6,
                background: i <= currentStep ? 'var(--accent, #1a6b5a)' : '#e2e8f0',
              }}
            />
          ))}
          <button
            onClick={skip}
            className="ml-auto text-slate-300 hover:text-slate-500 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-2xl mb-1">{step.emoji}</p>
        <h3 className="text-base font-bold text-slate-800 mb-1">{step.title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">{step.desc}</p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{currentStep + 1} / {STEPS.length}</span>
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--accent, #1a6b5a)' }}
          >
            {currentStep < STEPS.length - 1 ? 'Siguiente' : '¡Empezar!'}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
