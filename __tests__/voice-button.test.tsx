// @vitest-environment happy-dom
//
// Tests para components/voice-button.tsx
//
// REGRESIÓN PRIMORDIAL: hace tiempo el componente declaraba refs DESPUÉS
// del `if (!supported) return null`. En el primer render supported=false
// (efecto todavía no corrió) → componente devuelve null sin tocar hooks.
// En el segundo render supported=true → ahora los useRef se ejecutan,
// React detecta "Rendered more hooks" y crashea.
//
// Estos tests previenen esa regresión: rendereamos múltiples veces +
// transición supported false→true, y verificamos que React no tira.
//
// Otros aspectos cubiertos:
//   - Feature detection (sin MediaRecorder → no renderea nada)
//   - Estados: idle (gris) / recording (rojo + pulse)
//   - onStateChange y onError callbacks
//   - touchAction='none', userSelect, anti-iOS-quirks props
//   - aria-label cambia según estado

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// ── Mocks de MediaRecorder + getUserMedia ──────────────────────────────────
//
// happy-dom NO incluye MediaRecorder. Lo stubbeamos manualmente para que
// el feature detect del componente pase.

class FakeMediaRecorder {
  state = 'inactive'
  ondataavailable?: (e: { data: Blob }) => void
  onstop?: () => void
  start(_timeslice?: number) { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    // simular un blob de audio mínimo
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
  static isTypeSupported(_t: string) { return true }
}

function installMediaRecorder() {
  // @ts-expect-error — stub para tests
  globalThis.MediaRecorder = FakeMediaRecorder
}

function uninstallMediaRecorder() {
  // @ts-expect-error
  delete globalThis.MediaRecorder
}

function installGetUserMedia() {
  // @ts-expect-error — stubbing readonly DOM API
  navigator.mediaDevices = {
    getUserMedia: vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream)),
  }
}

function uninstallGetUserMedia() {
  // @ts-expect-error
  delete navigator.mediaDevices
}

beforeEach(() => {
  cleanup()
  installMediaRecorder()
  installGetUserMedia()
})

afterEach(() => {
  uninstallMediaRecorder()
  uninstallGetUserMedia()
  vi.restoreAllMocks()
})

// Importación tras los mocks
import { VoiceButton } from '@/components/voice-button'

// ── Feature detection ──────────────────────────────────────────────────────
describe('VoiceButton — feature detection', () => {
  it('sin MediaRecorder → no renderea nada', () => {
    uninstallMediaRecorder()
    const { container } = render(
      <VoiceButton onTranscript={() => {}} />,
    )
    // El primer render: supported=false, useEffect no corrió todavía.
    // Sin MediaRecorder global, el efecto setea supported=false. NO renderea.
    expect(container.querySelector('button')).toBeNull()
  })

  it('sin getUserMedia → no renderea nada', () => {
    uninstallGetUserMedia()
    const { container } = render(
      <VoiceButton onTranscript={() => {}} />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('con MediaRecorder + getUserMedia → renderea el botón', () => {
    render(<VoiceButton onTranscript={() => {}} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })
})

// ── Rules of Hooks regression ──────────────────────────────────────────────
describe('VoiceButton — Rules of Hooks regression', () => {
  it('re-render múltiples veces no tira error de hooks', () => {
    // Si el componente declarara hooks DESPUÉS de un early return,
    // este re-render forzado tiraría "Rendered fewer/more hooks than
    // during the previous render". Ese es exactamente el bug que
    // estamos evitando.
    const { rerender } = render(
      <VoiceButton onTranscript={() => {}} disabled={false} />,
    )

    // Forzar varios re-renders cambiando props sin desmontar
    for (let i = 0; i < 5; i++) {
      rerender(<VoiceButton onTranscript={() => {}} disabled={i % 2 === 0} />)
    }

    // Si llegamos acá sin throw, el bug NO está regresivo. Verificamos
    // que el botón esté ahí también (componente sano).
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('transición supported=false → supported=true (mock que se carga después) no tira', async () => {
    // Render inicial con MediaRecorder presente → supported=true después
    // del primer useEffect.
    const { rerender } = render(<VoiceButton onTranscript={() => {}} />)
    rerender(<VoiceButton onTranscript={() => {}} />)
    rerender(<VoiceButton onTranscript={() => {}} disabled />)

    expect(screen.getByRole('button')).toBeTruthy()
  })
})

// ── Visual state idle ──────────────────────────────────────────────────────
describe('VoiceButton — estado idle', () => {
  it('aria-label menciona "Mantené presionado para grabar"', () => {
    render(<VoiceButton onTranscript={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain('Mantené presionado')
  })

  it('aria-label menciona "Soltá para enviar" cuando está grabando', async () => {
    render(<VoiceButton onTranscript={() => {}} />)
    const btn = screen.getByRole('button')
    // pointerDown → arranca a grabar
    fireEvent.pointerDown(btn, { pointerId: 1 })
    // Esperamos un microtask para que startRecording async termine de setear state
    await new Promise(r => setTimeout(r, 10))
    expect(btn.getAttribute('aria-label')).toContain('Soltá')
  })

  it('tiene touchAction=none (anti-iOS gesture cancel)', () => {
    render(<VoiceButton onTranscript={() => {}} />)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.style.touchAction).toBe('none')
  })

  it('tiene userSelect=none (anti text selection)', () => {
    render(<VoiceButton onTranscript={() => {}} />)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.style.userSelect).toBe('none')
    // Nota: webkitUserSelect se setea inline pero happy-dom no siempre lo
    // expone en .style. Verificamos via getAttribute('style') que tiene el
    // -webkit-user-select. La regresión real (que iOS deje seleccionar
    // texto al hacer long-press) está cubierta por touchAction=none que
    // también testeamos.
    const inlineStyle = btn.getAttribute('style') ?? ''
    expect(inlineStyle.toLowerCase()).toContain('user-select')
  })

  it('disabled=true se refleja en el button', () => {
    render(<VoiceButton onTranscript={() => {}} disabled />)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})

// ── Pulse animation en recording ───────────────────────────────────────────
describe('VoiceButton — animación recording', () => {
  it('al hacer pointerDown, el botón gana class animate-mic-pulse', async () => {
    render(<VoiceButton onTranscript={() => {}} />)
    const btn = screen.getByRole('button')
    fireEvent.pointerDown(btn, { pointerId: 1 })
    await new Promise(r => setTimeout(r, 10))
    expect(btn.className).toContain('animate-mic-pulse')
  })
})

// ── Callbacks onStateChange / onError ─────────────────────────────────────
describe('VoiceButton — callbacks', () => {
  it('onStateChange recibe { kind: "recording", elapsedSec: 0 } al arrancar', async () => {
    const onStateChange = vi.fn()
    render(<VoiceButton onTranscript={() => {}} onStateChange={onStateChange} />)
    const btn = screen.getByRole('button')
    fireEvent.pointerDown(btn, { pointerId: 1 })
    await new Promise(r => setTimeout(r, 10))
    // Tiene que haber al menos UN call con kind=recording
    const recordingCalls = onStateChange.mock.calls.filter(
      (c) => (c[0] as { kind: string }).kind === 'recording',
    )
    expect(recordingCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('onError se llama si getUserMedia es rechazado', async () => {
    // Sobrescribir getUserMedia para rechazar con NotAllowedError
    // @ts-expect-error
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      const err = new Error('denied') as Error & { name: string }
      err.name = 'NotAllowedError'
      throw err
    })

    const onError = vi.fn()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<VoiceButton onTranscript={() => {}} onError={onError} />)
    const btn = screen.getByRole('button')
    fireEvent.pointerDown(btn, { pointerId: 1 })
    // Esperar a que falle el async
    await new Promise(r => setTimeout(r, 20))

    expect(onError).toHaveBeenCalled()
    const lastCall = onError.mock.calls[onError.mock.calls.length - 1][0] as { message: string; code: string }
    expect(lastCall.code).toBe('NotAllowedError')
    expect(lastCall.message).toContain('permiso')
    consoleWarn.mockRestore()
  })

  it('onError con NotFoundError = "No encontré un micrófono"', async () => {
    // @ts-expect-error
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      const err = new Error('no mic') as Error & { name: string }
      err.name = 'NotFoundError'
      throw err
    })

    const onError = vi.fn()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<VoiceButton onTranscript={() => {}} onError={onError} />)
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 })
    await new Promise(r => setTimeout(r, 20))

    expect(onError).toHaveBeenCalled()
    const lastErr = onError.mock.calls[onError.mock.calls.length - 1][0] as { message: string }
    expect(lastErr.message).toContain('No encontré un micrófono')
    consoleWarn.mockRestore()
  })

  it('onError con NotReadableError = "El micrófono está siendo usado por otra app"', async () => {
    // @ts-expect-error
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      const err = new Error('busy') as Error & { name: string }
      err.name = 'NotReadableError'
      throw err
    })

    const onError = vi.fn()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<VoiceButton onTranscript={() => {}} onError={onError} />)
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 })
    await new Promise(r => setTimeout(r, 20))

    const lastErr = onError.mock.calls[onError.mock.calls.length - 1][0] as { message: string }
    expect(lastErr.message).toContain('otra app')
    consoleWarn.mockRestore()
  })
})

// ── Ref API ─────────────────────────────────────────────────────────────────
describe('VoiceButton — ref API (clearError + cancel)', () => {
  it('clearError llama onError(null)', async () => {
    const onError = vi.fn()
    const ref = { current: null } as React.MutableRefObject<{ clearError: () => void; cancel: () => void } | null>
    render(<VoiceButton ref={ref} onTranscript={() => {}} onError={onError} />)

    // Esperar al primer render con el ref seteado
    await new Promise(r => setTimeout(r, 5))
    expect(ref.current).not.toBeNull()
    ref.current!.clearError()
    expect(onError).toHaveBeenCalledWith(null)
  })
})
