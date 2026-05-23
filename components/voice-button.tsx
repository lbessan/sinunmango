'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Mic } from 'lucide-react'

// ─── VoiceButton ────────────────────────────────────────────────────────────
//
// Botón push-to-talk al lado del input de Manguito. Estilo WhatsApp audio:
//
//   1. Press (mousedown/touchstart) → empieza a grabar
//   2. Release → para grabación + transcribe + llama onTranscript
//   3. Drag fuera del botón mientras presiona → cancela (no transcribe)
//
// Tecnología: Web Speech API nativa del browser. Cero costo, cero deps.
// Idioma fijo a 'es-AR' para mejor precisión con acento argentino.
//
// El componente SOLO renderea el botón. La UI de "grabando..." y los
// mensajes de error los maneja el parent vía las props onStateChange y
// onError, así puede posicionar el overlay donde tenga sentido (no
// dentro del propio componente, que terminaría con problemas de
// stacking y desbordes).
//
// Compatibilidad:
//   - Chrome / Edge / Opera (desktop y Android): ✓ funciona
//   - Safari iOS / macOS: ✓ con user gesture (lo cubre el press-to-start)
//   - Firefox: API no soportada → el botón NO se renderea
//
// IMPORTANTE: Web Speech API en Chrome desktop usa Google Cloud Speech
// (nube). Si hay VPN, ad-blocker, firewall o ISP que bloquee
// *.google.com / *.googleapis.com, el evento 'error' tira 'network'.
// En ese caso no hay fallback local — al user le toca probar otra red,
// otro browser, o escribir.

// Tipos de Web Speech API (no están en lib.dom por default)
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

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'recording'; elapsedSec: number }
  | { kind: 'transcribing' }

export type VoiceError = {
  /** Mensaje de error legible para mostrar al user */
  message: string
  /** Código bruto del SpeechRecognition error event (para logging/debug) */
  code:    string
}

export type VoiceButtonHandle = {
  /** Cierra el toast de error pendiente. El parent lo llama desde su
      botón de "X" sin tener que duplicar lógica de state. */
  clearError: () => void
}

export const VoiceButton = forwardRef<VoiceButtonHandle, {
  /** Callback con el texto transcripto al soltar el botón (sin cancelar). */
  onTranscript:   (text: string) => void
  /** Notifica al parent del state actual (para renderear overlay donde
      tenga sentido — el componente no maneja UI más allá del botón). */
  onStateChange?: (state: VoiceState) => void
  /** Notifica al parent de un error de transcripción. */
  onError?:       (err: VoiceError | null) => void
  disabled?:      boolean
}>(function VoiceButton({ onTranscript, onStateChange, onError, disabled }, ref) {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTextRef   = useRef<string>('')
  const cancelledRef   = useRef<boolean>(false)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  useImperativeHandle(ref, () => ({
    clearError: () => onError?.(null),
  }), [onError])

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null)
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
    finalTextRef.current = ''

    const recognition = new Ctor()
    // continuous=false: una sola frase. continuous=true daba 'network'
    // errors espurios en Chrome desktop cuando el user soltaba el botón
    // antes de que el socket recibiera result final.
    recognition.continuous     = false
    recognition.interimResults = false
    recognition.lang           = 'es-AR'

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal && result[0]) {
          finalTextRef.current += result[0].transcript
        }
      }
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
        message = 'Sin conexión a servicio de voz. Probá escribir, o desactivá VPN/bloqueadores y reintentá.'
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
      const text = finalTextRef.current.trim()
      if (!cancelledRef.current && text.length > 0) {
        onTranscript(text)
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
    recognitionRef.current?.stop()
  }

  // No renderear nada si el browser no soporta. El parent no ve el botón
  // y no rompe el layout.
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
