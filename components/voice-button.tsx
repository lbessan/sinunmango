'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Mic } from 'lucide-react'

// ─── VoiceButton ────────────────────────────────────────────────────────────
//
// Botón push-to-talk al lado del input de Manguito. UX estilo WhatsApp audio:
//
//   1. Press (mousedown/touchstart) → empieza a grabar con MediaRecorder
//   2. Release → para grabación + sube el audio a /api/asistente/transcribir
//      + llama onTranscript con el texto
//   3. Drag fuera del botón mientras presiona → cancela (no sube nada)
//
// Tecnología: MediaRecorder (browser nativo) + server-side Whisper.
//   - MediaRecorder funciona en Chrome / Edge / Firefox / Safari iOS+macOS
//   - El audio se manda al server que lo procesa con OpenAI Whisper
//   - Costo: ~$0.0001 por audio de 1s (Whisper: $0.006/min)
//
// Por qué NO usamos Web Speech API browser-side:
//   - Chrome desktop tira 'network' errors cuando hay VPN/blockers o ISP
//     bloquea *.google.com
//   - Safari iOS a veces no devuelve transcripción
//   - Calidad variable según motor del browser
//   - Whisper tiene calidad superior con acento argentino + jergas
//
// El componente SOLO renderea el botón. La UI de "grabando..." y los
// mensajes de error los maneja el parent vía las props onStateChange y
// onError, así puede posicionar el overlay dentro del panel del Manguito
// (no del propio componente, que tendría problemas de stacking).

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'recording'; elapsedSec: number }
  | { kind: 'transcribing' }

export type VoiceError = {
  /** Mensaje de error legible para mostrar al user */
  message: string
  /** Código para logging/debug */
  code:    string
}

export type VoiceButtonHandle = {
  clearError: () => void
}

// Detect feature: MediaRecorder + getUserMedia. Si falta alguno, no rendereamos.
function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)
}

// Elegir el mime type que el browser soporta. Chrome/Edge/Firefox prefieren
// webm/opus (más eficiente); Safari produce mp4. Probamos en orden.
function pickMimeType(): string {
  if (typeof window === 'undefined' || !window.MediaRecorder) return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ]
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''  // Que el browser elija default
}

export const VoiceButton = forwardRef<VoiceButtonHandle, {
  onTranscript:   (text: string) => void
  onStateChange?: (state: VoiceState) => void
  onError?:       (err: VoiceError | null) => void
  disabled?:      boolean
}>(function VoiceButton({ onTranscript, onStateChange, onError, disabled }, ref) {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef        = useRef<MediaStream | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const cancelledRef     = useRef<boolean>(false)
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)

  useImperativeHandle(ref, () => ({
    clearError: () => onError?.(null),
  }), [onError])

  useEffect(() => {
    setSupported(isMediaRecorderSupported())
  }, [])

  useEffect(() => {
    return () => {
      // Cleanup al desmontar: parar el stream para liberar el micrófono.
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const cleanup = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startRecording = async () => {
    if (!supported || disabled) return

    onError?.(null)
    cancelledRef.current = false
    chunksRef.current = []

    // Pedir permiso de micrófono. La primera vez el browser muestra prompt.
    // Si el user lo denegó previamente, getUserMedia tira NotAllowedError.
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // sampleRate dejamos default — el browser elige lo óptimo
        }
      })
      streamRef.current = stream
    } catch (err) {
      const e = err as DOMException
      let message = 'No pude acceder al micrófono.'
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        message = 'Tenés que dar permiso de micrófono al navegador.'
      } else if (e.name === 'NotFoundError') {
        message = 'No encontré un micrófono en este dispositivo.'
      } else if (e.name === 'NotReadableError') {
        message = 'El micrófono está siendo usado por otra app.'
      }
      console.warn('[VoiceButton] getUserMedia error:', e.name, e.message)
      onError?.({ message, code: e.name ?? 'getUserMedia-failed' })
      return
    }

    // Crear MediaRecorder
    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
    } catch (err) {
      console.error('[VoiceButton] MediaRecorder ctor error:', err)
      onError?.({ message: 'No pude iniciar la grabación.', code: 'recorder-ctor' })
      cleanup()
      return
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      setRecording(false)
      const chunks = chunksRef.current
      const mime   = recorder.mimeType || mimeType || 'audio/webm'
      const blob   = new Blob(chunks, { type: mime })

      // Liberar el micrófono ANTES de empezar el upload — algunos browsers
      // mantienen la luz del mic encendida mientras el stream esté activo.
      cleanup()

      if (cancelledRef.current || blob.size === 0) {
        onStateChange?.({ kind: 'idle' })
        return
      }

      onStateChange?.({ kind: 'transcribing' })

      // Subir al endpoint server-side
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'audio.webm')

        const res = await fetch('/api/asistente/transcribir', {
          method: 'POST',
          body:   formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = typeof data?.error === 'string'
            ? data.error
            : 'Error al transcribir. Probá de nuevo.'
          onError?.({ message: msg, code: `http-${res.status}` })
          onStateChange?.({ kind: 'idle' })
          return
        }

        const data = await res.json() as { text?: string }
        const text = (data.text ?? '').trim()
        if (text.length > 0) {
          onTranscript(text)
        } else {
          onError?.({ message: 'No te escuché bien. Probá de nuevo.', code: 'empty-text' })
        }
      } catch (err) {
        console.error('[VoiceButton] transcribe fetch error:', err)
        onError?.({ message: 'No pude conectar con el servidor.', code: 'fetch-failed' })
      } finally {
        onStateChange?.({ kind: 'idle' })
      }
    }

    // Arrancar grabación. timeslice=undefined → un solo blob al stop().
    try {
      recorder.start()
      setRecording(true)
      let elapsed = 0
      onStateChange?.({ kind: 'recording', elapsedSec: 0 })
      timerRef.current = setInterval(() => {
        elapsed++
        onStateChange?.({ kind: 'recording', elapsedSec: elapsed })
      }, 1000)
    } catch (err) {
      console.error('[VoiceButton] recorder.start error:', err)
      onError?.({ message: 'No pude iniciar la grabación.', code: 'start-failed' })
      cleanup()
      setRecording(false)
      onStateChange?.({ kind: 'idle' })
    }
  }

  const stopRecording = (cancel = false) => {
    if (!recording) return
    cancelledRef.current = cancel
    try {
      mediaRecorderRef.current?.stop()
    } catch {
      // Si ya estaba detenido, ignoramos.
    }
  }

  if (!supported) return null

  const handleStart = (e: React.PointerEvent) => {
    e.preventDefault()
    void startRecording()
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
