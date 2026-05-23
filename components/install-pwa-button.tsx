'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X, Smartphone, ArrowUpFromLine } from 'lucide-react'

// ─── InstallPWAButton ────────────────────────────────────────────────────────
//
// Botón explícito para instalar la PWA. Funciona en tres plataformas:
//
// 1. Android Chrome / Edge / Samsung Internet:
//    - El browser dispara `beforeinstallprompt` cuando la PWA es elegible.
//    - Capturamos el evento, lo guardamos, y al hacer click lo .prompt()-eamos.
//    - El user ve el diálogo nativo "Agregar app a la pantalla de inicio".
//
// 2. iOS Safari:
//    - No tiene API de prompt. Abrimos un modal con instrucciones manuales:
//      Compartir → Agregar a Pantalla de Inicio.
//
// 3. Cualquier browser que ya tenga la PWA instalada (display-mode: standalone):
//    - El botón no se renderea. La detección es por matchMedia + navigator
//      .standalone (legacy iOS).
//
// El componente decide por sí solo qué mostrar según la plataforma.

// Tipo del evento beforeinstallprompt (no está en el lib.dom estándar).
type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Variant = 'card' | 'inline'

export function InstallPWAButton({ variant = 'card' }: { variant?: Variant }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosModal,   setShowIosModal]   = useState(false)
  const [isStandalone,   setIsStandalone]   = useState(false)
  const [isIos,          setIsIos]          = useState(false)
  const [installed,      setInstalled]      = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detect si ya está instalada
    const nav   = window.navigator as Navigator & { standalone?: boolean }
    const stand =
      nav.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    setIsStandalone(stand)

    // Detect iOS
    const ua = window.navigator.userAgent
    const ios =
      /iPhone|iPad|iPod/.test(ua) ||
      (ua.includes('Mac') && 'ontouchend' in document)
    setIsIos(ios)

    // Capturar beforeinstallprompt (Android, Desktop Chromium)
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // Si el user instala (vía nuestro botón o desde el menú del browser),
    // limpiamos el deferred prompt y marcamos instalada.
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Decide si renderear: si ya está instalada o el browser no soporta,
  // no mostramos nada. Excepción: iOS Safari, ahí siempre podemos guiar
  // al user con el modal (aunque no haya beforeinstallprompt API).
  const canInstall = !isStandalone && !installed && (deferredPrompt !== null || isIos)
  if (!canInstall) return null

  const handleClick = async () => {
    if (deferredPrompt) {
      // Android / Chromium: trigger prompt nativo
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
      }
      setDeferredPrompt(null)
      return
    }
    if (isIos) {
      // iOS Safari: mostramos modal con instrucciones
      setShowIosModal(true)
    }
  }

  return (
    <>
      {variant === 'card' ? (
        <button
          onClick={handleClick}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left hover:bg-slate-50 transition-colors"
          style={{
            background:  'var(--bg-card-alt, #ffffff)',
            borderColor: 'var(--border, #e2e8f0)',
            color:       'var(--text-primary, #1e293b)',
          }}
        >
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent2, #1B3A6B) 0%, var(--accent, #1a6b5a) 100%)' }}
          >
            <Smartphone size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">Instalar sinunmango</p>
            <p
              className="text-xs mt-0.5 leading-snug"
              style={{ color: 'var(--text-muted, #94a3b8)' }}
            >
              {isIos
                ? 'Agregala a tu pantalla de inicio para usarla como app'
                : 'Instalala en tu teléfono o computadora con un click'}
            </p>
          </div>
          <Download size={16} className="shrink-0" style={{ color: 'var(--text-muted, #94a3b8)' }} />
        </button>
      ) : (
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          <Download size={15} />
          Instalar app
        </button>
      )}

      {/* iOS install modal */}
      {showIosModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}
              >
                <Smartphone size={22} />
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-base font-bold text-slate-800 mb-1">
              Instalar sinunmango en iPhone
            </p>
            <p className="text-sm text-slate-500 mb-5">
              Safari no tiene un botón directo. Estos son los 3 pasos:
            </p>

            <ol className="space-y-4 mb-5">
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <div className="text-sm text-slate-600 leading-relaxed pt-1">
                  Tocá el botón <ArrowUpFromLine size={14} className="inline align-text-bottom mx-0.5" aria-label="Compartir" /> <strong className="text-slate-800">Compartir</strong> en la barra inferior de Safari.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <div className="text-sm text-slate-600 leading-relaxed pt-1">
                  Bajá y elegí <strong className="text-slate-800">Agregar a pantalla de inicio</strong>.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <div className="text-sm text-slate-600 leading-relaxed pt-1">
                  Tocá <strong className="text-slate-800">Agregar</strong>. La app aparece como ícono y la abrís sin barras de browser.
                </div>
              </li>
            </ol>

            <p className="text-xs text-slate-400 leading-relaxed">
              Es una funcionalidad de Safari, no de la app. Sin descargas, sin App Store.
            </p>

            <button
              onClick={() => setShowIosModal(false)}
              className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(90deg, #1B3A6B, #1a6b5a)' }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Toast cuando recién se instaló (Android) */}
      {installed && variant === 'card' && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fadeOut"
          style={{ animation: 'fadeOut 3s ease-out forwards' }}
        >
          <Smartphone size={16} />
          <span>¡App instalada!</span>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeOut {
          0%   { opacity: 0; transform: translate(-50%, 10px); }
          15%  { opacity: 1; transform: translate(-50%, 0); }
          85%  { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
      `}</style>
    </>
  )
}
