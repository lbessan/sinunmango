'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Mic } from 'lucide-react'

// ─── VoiceButton ────────────────────────────────────────────────────────────
//
// Botón push-to-talk al lado del input de Manguito. Estilo WhatsApp audio.
// Usa Web Speech API browser-native — cero deps, cero costo, cero plataforma
// extra. Es flaky en algunos contextos (ver "Limitaciones conocidas") pero
// para los que funciona, funciona instantáneo y gratis.
//
// Flow:
//   1. Press (pointerdown) → empieza a grabar
//   2. Mientras graba: el componente expone state 'recording' con timer
//   3. Release → para grabación, devuelve el texto transcripto
//   4. Drag fuera del botón mientras presiona → cancela (no transcribe)
//
// CRÍTICO: configuración basada en investigación de varios artículos sobre
// quirks reales de la API:
//
//   - `interimResults: true` + acumulador: en Safari iOS los eventos
//     isFinal=true a menudo NO llegan. Solo llegan isFinal=false. Si solo
//     leemos los final, mobile queda vacío. Acumulamos AMBOS y al onend
//     usamos el último que tengamos (el más completo).
//
//   - `continuous: false`: con true tira 'network' errors espurios en
//     Chrome desktop cuando el user suelta antes de que el socket reciba
//     final. Para frases cortas (nuestro caso), false es mejor.
//
//   - Detección de standalone iOS PWA: Apple NO permite SpeechRecognition
//     en PWAs instaladas. Si lo detectamos, ocultamos el botón en lugar
//     de mostrar uno roto.
//
// Limitaciones conocidas (no son bugs, son del ecosistema):
//
//   ❌ Firefox: API no implementada
//   ❌ Brave: API expuesta pero siempre tira 'network'
//   ❌ Safari iOS instalado como PWA standalone: bloqueado por Apple
//   ⚠️  Chrome desktop con VPN/ad-blocker/ISP que bloquee *.google.com:
//       tira 'network'. No hay workaround del lado del código — el user
//       tiene que cambiar de red o ir a otro browser, o escribir.

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'recording'; elapsedSec: number }

export type VoiceError = {
  message: string
  code:    string
}

export type VoiceButtonHandle = {
  clearError: () => void
}

// Tipos de Web Speech API (no están en lib.dom)
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
  continuous:     boolean
  interimResults: boolean
  lang:           string
  start():        void
  stop():         void
  abort():        void
  onresult:       ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror:        ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onend:          ((this: SpeechRecognition) => void) | null
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

// Detect si estamos en iOS Safari corriendo como PWA standalone.
// En ese caso la API existe pero Apple bloquea el reconocimiento — el
// botón no haría nada útil, mejor ocultarlo.
function isIosStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document)
  if (!isIos) return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
}

export const VoiceButton = forwardRef<VoiceButtonHandle, {
  onTranscript:   (text: string) => void
  onStateChange?: (state: VoiceState) => void
  onError?:       (err: VoiceError | null) => void
  disabled?:      boolean
}>(function VoiceButton({ onTranscript, onStateChange, onError, disabled }, ref) {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Acumulamos el "mejor texto que tenemos hasta ahora" — el más reciente
  // que sea final, o si no hay finales, el más reciente interim. Esto es
  // clave para que mobile funcione (donde isFinal=true puede no llegar nunca).
  const bestTextRef    = useRef<string>('')
  const cancelledRef   = useRef<boolean>(false)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  useImperativeHandle(ref, () => ({
    clearError: () => onError?.(null),
  }), [onError])

  useEffect(() => {
    // Feature detect + plataforma. Si es iOS PWA standalone, ocultamos.
    const hasApi = getSpeechRecognitionCtor() !== null
    setSupported(hasApi && !isIosStandalonePwa())
  }, [])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startRecording = () => {
    if (!supported || disabled) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    onError?.(null)
    cancelledRef.current = false
    bestTextRef.current  = ''

    const recognition = new Ctor()
    // Configuración crítica:
    //   - continuous=false: una sola sesión, no streaming. Más estable
    //     en Chrome desktop (evita 'network' espurios al cerrar socket).
    //   - interimResults=true: vital para que mobile devuelva algo. En
    //     Safari iOS los isFinal=true no siempre llegan; los interim sí.
    recognition.continuous     = false
    recognition.interimResults = true
    recognition.lang           = 'es-AR'

    recognition.onresult = (event) => {
      // Acumulamos TODOS los resultados (interim + final). El más reciente
      // es el más completo. Lo guardamos como "lo mejor que tenemos".
      // Cuando onend se dispare, devolvemos esto al parent.
      let combined = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result[0]) combined += result[0].transcript
      }
      bestTextRef.current = combined
    }

    recognition.onerror = (event) => {
      const code = event.error
      if (code === 'aborted') return  // user-initiated, no es error real
      let message = 'Error al grabar. Probá de nuevo.'
      if (code === 'no-speech') {
        message = 'No te escuché. Probá de nuevo.'
      } else if (code === 'not-allowed' || code === 'service-not-allowed') {
        message = 'Tenés que dar permiso de micrófono al navegador.'
      } else if (code === 'audio-capture') {
        message = 'No pude usar el micrófono. ¿Otra app lo está usando?'
      } else if (code === 'network') {
        // Web Speech API browser-side depende de servidores externos
        // (Google en Chrome/Edge, Apple en Safari). Si la red bloquea,
        // no podemos solucionarlo desde acá.
        message = 'Tu red bloquea el servicio de voz del navegador. Probá escribir, o desactivá VPN/bloqueadores.'
      }
      console.warn('[VoiceButton] error:', code, event.message ?? '')
      onError?.({ message, code })
    }

    recognition.onend = () => {
      setRecording(false)
      onStateChange?.({ kind: 'idle' })
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      const text = bestTextRef.current.trim()
      // Si el user canceló (drag out), no mandamos texto.
      if (cancelledRef.current) return
      if (text.length > 0) {
        onTranscript(text)
      } else {
        // Texto vacío al final = no se entendió nada. Mensaje al user.
        onError?.({ message: 'No te escuché. Probá de nuevo.', code: 'empty-text' })
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setRecording(true)
      let elapsed = 0
      onStateChange?.({ kind: 'recording', elapsedSec: 0 })
      timerRef.current = setInterval(() => {
        elapsed++
        onStateChange?.({ kind: 'recording', elapsedSec: elapsed })
      }, 1000)
    } catch (err) {
      console.error('[VoiceButton] start error:', err)
      onError?.({ message: 'No pude iniciar la grabación.', code: 'start-failed' })
      setRecording(false)
      onStateChange?.({ kind: 'idle' })
    }
  }

  const stopRecording = (cancel = false) => {
    if (!recording) return
    cancelledRef.current = cancel
    try {
      recognitionRef.current?.stop()
    } catch {
      // Si ya estaba detenido, ignoramos
    }
  }

  // No renderear nada si el browser no soporta o es iOS PWA standalone.
  // Mejor que un botón roto.
  if (!supported) return null

  const handleStart = (e: React.PointerEvent) => {
    e.preventDefault()
    startRecording()
  }

  const handleEnd = (e: React.PointerEvent) => {
    e.preventDefault()
    stopRecording(false)
  }

  const handleLeave = () => {
    if (recording) stopRecording(true)
  }

  return (
    <button
      type="button"
      aria-label={recording ? 'Soltá para enviar el audio' : 'Mantené presionado para grabar'}
      disabled={disabled}
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerLeave={handleLeave}
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
    </button>
  )
})

export function formatVoiceTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
