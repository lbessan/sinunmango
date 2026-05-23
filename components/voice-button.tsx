'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, X } from 'lucide-react'

// ─── VoiceButton ────────────────────────────────────────────────────────────
//
// Botón push-to-talk al lado del input de Manguito. UX estilo WhatsApp audio:
//
//   1. Press (mousedown/touchstart) → empieza a grabar
//   2. Mientras presiona: muestra timer, animación de pulso, "Soltá para enviar"
//   3. Release (mouseup/touchend) → para grabación, transcribe, llena el input
//   4. Drag fuera del botón mientras presiona → cancela (no manda nada)
//
// Tecnología: Web Speech API nativa del browser. Cero costo, cero deps.
// Idioma fijo a 'es-AR' para mejor precisión con acento argentino.
//
// Compatibilidad:
//   - Chrome / Edge / Opera (desktop y Android): ✓ funciona bien
//   - Safari iOS / macOS: ✓ funciona pero requiere user gesture explícito
//     (lo cubre el press-to-start)
//   - Firefox: webkitSpeechRecognition no soportada → el botón no se renderea
//
// Si el browser no soporta la API o el user negó permiso de micrófono, el
// componente devuelve null. Esa es la razón de no usar feature-detect
// asincrónico en parent — el botón "no aparece" en browsers no compatibles.

// Tipos de Web Speech API (no están en lib.dom por default, los definimos)
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message?: string
}

interface SpeechRecognition extends EventTarget {
  continuous:        boolean
  interimResults:    boolean
  lang:              string
  start():           void
  stop():            void
  abort():           void
  onresult:          ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror:           ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onend:             ((this: SpeechRecognition) => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?:       SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function VoiceButton({
  onTranscript,
  disabled,
}: {
  /** Callback con el texto transcripto. El parent decide qué hacer (llenar
      input, enviar directo, etc). */
  onTranscript: (text: string) => void
  disabled?:    boolean
}) {
  const [supported,  setSupported]  = useState(false)
  const [recording,  setRecording]  = useState(false)
  const [cancelled,  setCancelled]  = useState(false)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTextRef   = useRef<string>('')
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef   = useRef<boolean>(false)

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null)
  }, [])

  useEffect(() => {
    return () => {
      // Cleanup: si el componente desmonta mientras está grabando, cortar.
      recognitionRef.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startRecording = () => {
    if (!supported || disabled) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    setErrorMsg(null)
    setCancelled(false)
    cancelledRef.current = false
    finalTextRef.current = ''
    setElapsedSec(0)

    const recognition = new Ctor()
    recognition.continuous     = true
    recognition.interimResults = false
    recognition.lang           = 'es-AR'

    recognition.onresult = (event) => {
      // Acumulamos todos los resultados finales (porque continuous=true).
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal && result[0]) {
          finalTextRef.current += result[0].transcript
        }
      }
    }

    recognition.onerror = (event) => {
      const code = event.error
      if (code === 'no-speech') {
        setErrorMsg('No te escuché. Probá de nuevo.')
      } else if (code === 'not-allowed' || code === 'service-not-allowed') {
        setErrorMsg('Permiso de micrófono denegado.')
      } else if (code === 'audio-capture') {
        setErrorMsg('No pude usar el micrófono.')
      } else if (code === 'network') {
        setErrorMsg('Error de red. Probá de nuevo.')
      } else if (code !== 'aborted') {
        setErrorMsg('Error al grabar.')
      }
      // Si fue 'aborted' (cancel del user), no mostramos error
    }

    recognition.onend = () => {
      // onend dispara tanto en stop() normal como en abort().
      setRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      const text = finalTextRef.current.trim()
      // Si el user canceló (drag out), no mandamos el texto.
      if (!cancelledRef.current && text.length > 0) {
        onTranscript(text)
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setRecording(true)
      timerRef.current = setInterval(() => {
        setElapsedSec(s => s + 1)
      }, 1000)
    } catch (err) {
      console.error('[VoiceButton] start error:', err)
      setErrorMsg('No pude iniciar la grabación.')
      setRecording(false)
    }
  }

  const stopRecording = (cancel = false) => {
    if (!recording) return
    cancelledRef.current = cancel
    setCancelled(cancel)
    recognitionRef.current?.stop()
  }

  // No renderear nada si el browser no soporta la API. Mejor que mostrar
  // botón roto que el user va a clickear esperando que funcione.
  if (!supported) return null

  // Touch handlers — push-to-talk. Para mobile usamos touch events;
  // para desktop, mouse events. Ambos hacen lo mismo: start/stop.
  const handleStart = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    startRecording()
  }

  const handleEnd = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    stopRecording(false)
  }

  // Cancel: si el user mueve el dedo/mouse fuera del botón mientras presiona.
  // Esto matchea el patrón de WhatsApp audio "drag to cancel".
  const handleLeave = () => {
    if (recording) stopRecording(true)
  }

  return (
    <>
      <button
        type="button"
        aria-label={recording ? 'Soltá para enviar el audio' : 'Mantené presionado para grabar'}
        disabled={disabled}
        onPointerDown={handleStart}
        onPointerUp={handleEnd}
        onPointerLeave={handleLeave}
        // touchstart prevent default — algunos browsers triggerean mousedown
        // después de touchend si no lo prevenimos, causando double-start.
        onContextMenu={e => e.preventDefault()}
        className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-all mb-0.5 ${
          recording ? 'animate-mic-pulse' : ''
        }`}
        style={{
          background: recording
            ? '#ef4444'
            : disabled
              ? '#cbd5e1'
              : 'var(--bg-card-alt, #f1f5f9)',
          color: recording ? '#ffffff' : 'var(--text-secondary, #64748b)',
        }}
      >
        <Mic size={14} />
      </button>

      {/* Overlay durante grabación — full panel, oscuro, instrucciones */}
      {recording && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-red-100 bg-red-50/95 px-4 py-3 backdrop-blur-sm"
          style={{ borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}
        >
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-700 leading-tight">
              Grabando… {formatTime(elapsedSec)}
            </p>
            <p className="text-[10px] text-red-600/80 mt-0.5">
              Soltá para enviar · Arrastrá afuera del botón para cancelar
            </p>
          </div>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="shrink-0 p-1.5 rounded-lg text-red-500 hover:bg-red-100"
            aria-label="Cancelar grabación"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Toast de error o cancel */}
      {errorMsg && !recording && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-700"
          style={{ borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="ml-auto p-1 rounded text-amber-500 hover:bg-amber-100"
            aria-label="Cerrar"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {cancelled && !recording && !errorMsg && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500"
          style={{ borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}
        >
          <span>Audio cancelado</span>
          <button
            type="button"
            onClick={() => setCancelled(false)}
            className="ml-auto p-1 rounded text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes mic-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50%      { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        }
        .animate-mic-pulse {
          animation: mic-pulse 1.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-mic-pulse { animation: none; }
        }
      `}</style>
    </>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
