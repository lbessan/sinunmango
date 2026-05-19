'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X } from 'lucide-react'
import { useSidebar } from './sidebar-context'

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
    desc:   'Tu foto del mes en un vistazo: saldo disponible en pesos y dólares, gastos del mes, deuda de tarjetas y proyección de cómo terminás.',
    emoji:  '📊',
  },
  {
    tourId: 'tour-movimientos',
    title:  'Movimientos',
    desc:   'Cargá gastos e ingresos como prefieras: a mano, escaneando un ticket con la cámara, o reenviando los mails de notificación de tu banco a tu dirección @sinunmango.com.ar y se cargan solos.',
    emoji:  '💸',
  },
  {
    tourId: 'tour-cuentas',
    title:  'Cuentas',
    desc:   'Bancos, billeteras y efectivo. En pesos o dólares. Cada saldo se actualiza en tiempo real con cada movimiento que cargás.',
    emoji:  '🏦',
  },
  {
    tourId: 'tour-tarjetas',
    title:  'Tarjetas de crédito',
    desc:   'Subí el PDF del resumen y la IA detecta todos los consumos. Seguí el gasto por período, conciliá contra el resumen real, y sabé cuándo vence cada cierre.',
    emoji:  '💳',
  },
  {
    tourId: 'tour-manguito',
    title:  'Manguito',
    desc:   'Tu asistente con IA. Preguntale "¿cuánto gasté esta semana?" o dictale un gasto: "gasté $4.500 en el súper" — lo registra solo.',
    emoji:  '🥭',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

export function TourOverlay({ onDone }: { onDone: () => void }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect]   = useState<Rect | null>(null)
  const router = useRouter()
  const { openSidebar, closeSidebar } = useSidebar()

  const step = STEPS[currentStep]

  // En mobile (< lg) la sidebar está oculta detrás del drawer cerrado. Los
  // anchors data-tour viven adentro de la sidebar → getBoundingClientRect()
  // retorna 0/0 y el spotlight no se ve. Abrimos el drawer al iniciar tour
  // y lo cerramos al terminar. El último step (Manguito FAB) no necesita
  // sidebar abierta porque su anchor está en el FAB flotante.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isMobile = window.innerWidth < 1024
    if (!isMobile) return

    if (step.tourId === 'tour-manguito') {
      // El FAB del Manguito es visible incluso con la sidebar cerrada
      closeSidebar()
    } else {
      openSidebar()
    }
  }, [step.tourId, openSidebar, closeSidebar])

  // Re-medir después de que la animación del drawer termina (~300ms en app-shell).
  // Si medimos al instante, las clases translate-x todavía no se aplicaron y
  // getBoundingClientRect retorna posiciones intermedias.
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
    // Re-medición diferida para esperar a la transición del drawer en mobile.
    const t = setTimeout(measureTarget, 350)
    window.addEventListener('resize', measureTarget)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measureTarget)
    }
  }, [measureTarget])

  const next = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      finish()
    }
  }

  // Al terminar/saltar: cerrar el drawer (si estaba abierto por el tour) y
  // notificar al parent.
  const finish = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      closeSidebar()
    }
    onDone()
  }

  const skip = () => finish()

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

  // Tooltip positioning. En desktop: a la derecha del spotlight.
  // En mobile (cuando la sidebar drawer está abierta) el spotlight queda en
  // la izquierda del viewport — el tooltip va abajo del spotlight para no
  // tapar la sidebar ni quedar afuera del viewport.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const TOOLTIP_W = isMobile ? Math.min(320, window.innerWidth - 32) : 288

  let tooltipLeft: number | string
  let tooltipTop: number | string

  if (!spotlight) {
    tooltipLeft = '50%'
    tooltipTop = '50%'
  } else if (isMobile) {
    // Mobile: centrado horizontal, debajo del spotlight si hay espacio,
    // arriba si no.
    tooltipLeft = Math.max(16, (window.innerWidth - TOOLTIP_W) / 2)
    const belowSpace = window.innerHeight - (spotlight.top + spotlight.height)
    const TOOLTIP_H = 240
    tooltipTop = belowSpace > TOOLTIP_H + 24
      ? spotlight.top + spotlight.height + 16
      : Math.max(16, spotlight.top - TOOLTIP_H - 16)
  } else {
    // Desktop: a la derecha del spotlight, clamp-eado al viewport.
    tooltipLeft = Math.min(spotlight.left + spotlight.width + 16, window.innerWidth - TOOLTIP_W - 16)
    tooltipTop = Math.max(16, spotlight.top + spotlight.height / 2 - 100)
  }

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

      {/* Tooltip card. Width responsive (max-w-[calc(100vw-2rem)] evita que
          se salga en pantallas < 320px). */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl p-5"
        style={{
          width: TOOLTIP_W,
          maxWidth: 'calc(100vw - 2rem)',
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
