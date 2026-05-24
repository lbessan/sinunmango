'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Send, X, User, CheckCircle, AlertCircle, Loader2, Minimize2, Trash2, Sparkles } from 'lucide-react'
import { VoiceButton, formatVoiceTime, type VoiceState, type VoiceError, type VoiceButtonHandle } from './voice-button'

// ─── Types ────────────────────────────────────────────────────────────────────
type Message = {
  id:           string
  role:         'user' | 'assistant'
  content:      string
  accion?:      Record<string, unknown>
  accionEstado?: 'pendiente' | 'confirmando' | 'ok' | 'error'
  accionMsg?:   string
  // Caso especial: al usuario se le acabó el cupo Free del mes
  limitReached?: { limit: number; used: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseAccion(text: string): { clean: string; accion: Record<string, unknown> | null } {
  const match = text.match(/<accion>([\s\S]*?)<\/accion>/)
  if (!match) return { clean: text, accion: null }
  try {
    const accion = JSON.parse(match[1].trim())
    return { clean: text.replace(/<accion>[\s\S]*?<\/accion>/, '').trim(), accion }
  } catch {
    return { clean: text, accion: null }
  }
}

const EJEMPLOS = [
  '¿Cuánto gasté el mes pasado?',
  '¿Cuál es mi saldo disponible?',
  'Gasté $4.500 en el súper',
  '¿Cómo va el mes de mayo?',
]

// ─── AccionCard ───────────────────────────────────────────────────────────────
function AccionCard({ accion, estado, msg, onConfirmar, onCancelar }: {
  accion:      Record<string, unknown>
  estado:      'pendiente' | 'confirmando' | 'ok' | 'error'
  msg?:        string
  onConfirmar: () => void
  onCancelar:  () => void
}) {
  if (estado === 'ok') return (
    <div className="mt-2 flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
      <CheckCircle size={13} />{msg ?? 'Movimiento registrado'}
    </div>
  )
  if (estado === 'error') return (
    <div className="mt-2 flex items-center gap-1.5 text-red-500 text-xs">
      <AlertCircle size={13} />{msg ?? 'Error al registrar'}
    </div>
  )
  return (
    <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs">
      <p className="font-semibold text-blue-700 mb-1.5">¿Registrar este movimiento?</p>
      <div className="text-blue-600 space-y-0.5 mb-2.5">
        <p><span className="font-medium">Detalle:</span> {String(accion.detalle ?? '—')}</p>
        <p><span className="font-medium">Monto:</span> ${Number(accion.monto ?? 0).toLocaleString('es-AR')} {String(accion.moneda ?? 'ARS')}</p>
        <p><span className="font-medium">Fecha:</span> {String(accion.fecha ?? '—')}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirmar} disabled={estado === 'confirmando'}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--accent, #1a6b5a)' }}
        >
          {estado === 'confirmando' ? <><Loader2 size={11} className="animate-spin" />Guardando</> : '✓ Confirmar'}
        </button>
        <button onClick={onCancelar} className="flex-1 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200 bg-white">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── LimitReachedCard ─────────────────────────────────────────────────────────
// Reemplaza el mensaje crudo "Error: limit_reached" con un card ameno y un
// CTA a la página /pro. Tono cálido, no penalizante.
function LimitReachedCard({ limit, used }: { limit: number; used: number }) {
  return (
    <div
      className="rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-[280px]"
      style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 60%, #eef2ff 100%)', border: '1px solid #e0e7ff' }}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <Sparkles size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 leading-tight">Llegaste al límite del mes</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Usaste {used} de {limit} mensajes Free
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed mb-3">
        Pasate a Pro y tené el asistente sin límites, parseo de tickets y resúmenes, e insights con IA. Probalo 7 días gratis.
      </p>
      <Link
        href="/pro"
        className="block text-center px-3 py-2 rounded-lg text-xs font-semibold text-white shadow-sm hover:shadow transition-shadow"
        style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
      >
        Ver Plan Pro →
      </Link>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ size = 26 }: { size?: number }) {
  return (
    <div className="rounded-full shrink-0 overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent, #1a6b5a) 100%)' }}>
      <Image src="/manguito.png" alt="Manguito" width={Math.round(size * 0.78)} height={Math.round(size * 0.78)} style={{ objectFit: 'contain' }} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ManguitoFlotante() {
  // Todos los hooks PRIMERO — Rules of Hooks (orden estable entre renders).
  const pathname                = usePathname()
  const searchParams            = useSearchParams()
  // El tour del onboarding (?tour=1) destaca el FAB con un spotlight y un
  // tooltip al costado. Mientras el tour esté activo, ocultamos el label
  // "Hablar con Manguito" para que no se solape con el tooltip del tour.
  const tourActive              = searchParams?.get('tour') === '1'
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>({ kind: 'idle' })
  const [voiceError, setVoiceError] = useState<VoiceError | null>(null)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)
  const panelRef                = useRef<HTMLDivElement>(null)
  const voiceButtonRef          = useRef<VoiceButtonHandle>(null)

  // No renderear el FAB cuando ya estamos en /asistente — ese es el chat
  // completo del Manguito; tener el FAB encima es redundante y tapaba el
  // input bar de la página. /asistente es el "modo grande" del mismo chat.
  const hideFab = pathname === '/asistente'

  // Auto-scroll
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Focus textarea when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 120)
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content }
    const assistantId      = crypto.randomUUID()
    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/asistente', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'unknown' }))
        if (data.error === 'limit_reached') {
          setMessages(prev => prev.map(m => m.id === assistantId
            ? { ...m, content: '', limitReached: { limit: data.limit ?? 5, used: data.used ?? 0 } }
            : m
          ))
        } else {
          setMessages(prev => prev.map(m => m.id === assistantId
            ? { ...m, content: `Ups, algo no salió bien. Probá de nuevo en un ratito.` }
            : m
          ))
        }
        // Notificar al sidebar para que refresque el contador de cupos
        window.dispatchEvent(new Event('usage:changed'))
        return
      }
      // Llamada OK: refrescar contador post-stream
      window.dispatchEvent(new Event('usage:changed'))

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              fullText += parsed.delta.text
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m))
            }
          } catch { /* ignore */ }
        }
      }
      const { clean, accion } = parseAccion(fullText)
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: clean, accion: accion ?? undefined, accionEstado: accion ? 'pendiente' : undefined }
          : m
      ))
    } finally {
      setLoading(false)
    }
  }

  const confirmarAccion = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg?.accion) return
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, accionEstado: 'confirmando' } : m))
    try {
      const res  = await fetch('/api/asistente-accion', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(msg.accion),
      })
      const data = await res.json()
      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, accionEstado: res.ok && data.ok ? 'ok' : 'error', accionMsg: res.ok && data.ok ? `✓ Guardado — $${Number(data.monto).toLocaleString('es-AR')}` : data.error }
          : m
      ))
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, accionEstado: 'error', accionMsg: 'Error de red' } : m))
    }
  }

  const cancelarAccion = (msgId: string) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, accion: undefined, accionEstado: undefined } : m))

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const limpiarChat = () => setMessages([])

  // Early return DESPUÉS de todos los hooks (Rules of Hooks compliant).
  if (hideFab) return null

  return (
    <>
      {/* ── Panel flotante ─────────────────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop sutil — solo en mobile */}
          <div
            className="fixed inset-0 z-40 sm:hidden"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setOpen(false)}
          />

          <div
            ref={panelRef}
            className="fixed z-50 flex flex-col overflow-hidden"
            style={{
              // bottom: 112px desde el FAB (que ya respeta safe-area-bottom),
              // sumamos otra vez safe-area-bottom para que el panel quede
              // por encima del FAB que también está desplazado.
              right:        24,
              bottom:       'calc(112px + env(safe-area-inset-bottom))',
              width:        'min(520px, calc(100vw - 48px))',
              // height: 100dvh menos los offsets para FAB (140px) y safe-area
              // top+bottom. Sin restar el safe-area-top, en iPhone con notch
              // el header del chat queda parcialmente cubierto por el notch.
              height:       'min(680px, calc(100dvh - 140px - env(safe-area-inset-top) - env(safe-area-inset-bottom)))',
              borderRadius: 20,
              background:   'var(--bg-card, #f8fafc)',
              boxShadow:    '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.12)',
              border:       '1px solid var(--border, rgba(0,0,0,0.08))',
            }}
          >
            {/* Header */}
            <div
              className="shrink-0 flex items-center gap-3 px-4 py-3.5"
              style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent, #1a6b5a) 100%)' }}
            >
              {/* Avatar grande */}
              <div className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
                style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 0 2px rgba(255,255,255,0.2)' }}>
                <Image src="/manguito.png" alt="Manguito" width={34} height={34} style={{ objectFit: 'contain' }} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-base leading-tight">Manguito</p>
                <p className="text-white/50 text-xs mt-0.5">Tu asistente financiero</p>
              </div>

              <div className="flex items-center gap-1.5">
                {messages.length > 0 && (
                  <button
                    onClick={limpiarChat}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                    title="Limpiar chat"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                  title="Minimizar"
                >
                  <Minimize2 size={15} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">

              {/* Mensaje de bienvenida — siempre visible */}
              <div className="flex gap-2.5 items-start">
                <Avatar size={28} />
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-700 leading-relaxed shadow-sm max-w-[85%]"
                  style={{ background: 'var(--bg-card-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  Hola 👋 Soy Manguito, tu asistente financiero. Preguntame lo que necesites sobre tus finanzas o dictame un gasto para registrarlo.
                </div>
              </div>

              {/* Ejemplos rápidos — solo cuando no hay mensajes */}
              {messages.length === 0 && (
                <div className="grid grid-cols-1 gap-1.5 pl-9">
                  {EJEMPLOS.map(ej => (
                    <button
                      key={ej}
                      onClick={() => sendMessage(ej)}
                      className="text-left px-3 py-2 rounded-xl text-xs transition-colors"
                      style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    >
                      {ej}
                    </button>
                  ))}
                </div>
              )}

              {/* Mensajes del chat */}
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant'
                    ? <Avatar size={26} />
                    : (
                      <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5 text-white"
                        style={{ background: 'var(--accent2, #1B3A6B)', minWidth: 24 }}>
                        <User size={11} />
                      </div>
                    )
                  }
                  <div className={`max-w-[82%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.limitReached ? (
                      <LimitReachedCard limit={msg.limitReached.limit} used={msg.limitReached.used} />
                    ) : (
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                        msg.role === 'user'
                          ? 'text-white rounded-tr-sm'
                          : 'rounded-tl-sm'
                      }`}
                        style={msg.role === 'user'
                          ? { background: 'var(--accent2, #1B3A6B)' }
                          : { background: 'var(--bg-card-alt)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }
                        }
                      >
                        {msg.content || (loading && msg.role === 'assistant'
                          ? <span className="flex gap-1.5 items-center text-slate-400 text-xs">
                              <Loader2 size={11} className="animate-spin" />pensando...
                            </span>
                          : '')}
                      </div>
                    )}
                    {msg.accion && msg.accionEstado && (
                      <div className="w-full">
                        <AccionCard
                          accion={msg.accion}
                          estado={msg.accionEstado}
                          msg={msg.accionMsg}
                          onConfirmar={() => confirmarAccion(msg.id)}
                          onCancelar={() => cancelarAccion(msg.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>

            {/* Input — relative para que el overlay de grabación/error
                se posicione contra este contenedor (dentro del panel,
                no del viewport). */}
            <div
              className="shrink-0 px-4 pb-4 pt-2 relative"
              style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
            >
              {/* Overlay durante grabación — arriba del input bar, dentro
                  del panel. La X cancela la grabación sin subir audio
                  (más confiable que el drag-out que antes fallaba en
                  iOS PWA standalone). */}
              {voiceState.kind === 'recording' && (
                <div className="absolute inset-x-4 -top-1 -translate-y-full z-10 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-red-700 leading-tight">
                      Grabando · {formatVoiceTime(voiceState.elapsedSec)}
                    </p>
                    <p className="text-[10px] text-red-600/80 mt-0.5">
                      Soltá el micrófono para enviar
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => voiceButtonRef.current?.cancel()}
                    className="shrink-0 p-1 rounded-md text-red-500 hover:bg-red-100"
                    aria-label="Cancelar grabación"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Overlay durante transcripción (después de soltar) */}
              {voiceState.kind === 'transcribing' && (
                <div className="absolute inset-x-4 -top-1 -translate-y-full z-10 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                  <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                  <p className="text-[11px] font-semibold text-blue-700 leading-tight">
                    Transcribiendo audio…
                  </p>
                </div>
              )}

              {/* Toast de error de voz — solo cuando no hay grabación ni
                  transcripción activa */}
              {voiceError && voiceState.kind === 'idle' && (
                <div className="absolute inset-x-4 -top-1 -translate-y-full z-10 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 shadow-lg text-[11px] text-amber-700">
                  <span className="flex-1 leading-snug">{voiceError.message}</span>
                  <button
                    type="button"
                    onClick={() => setVoiceError(null)}
                    className="p-0.5 rounded text-amber-500 hover:bg-amber-100 shrink-0"
                    aria-label="Cerrar"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}

              <div className="rounded-2xl px-3 py-2.5 flex gap-2 items-end shadow-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribí un mensaje o mantené el mic"
                  rows={1}
                  className="flex-1 resize-none text-sm text-slate-800 outline-none bg-transparent placeholder-slate-400 self-center"
                  style={{ minHeight: 26, maxHeight: 120, lineHeight: '1.5' }}
                  onInput={e => {
                    const t = e.target as HTMLTextAreaElement
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                  }}
                />
                {/* Botón micrófono: push-to-talk. Al soltar, el texto
                    transcripto cae en el input para que el user lo revise
                    y mande (o edite si la transcripción falló).
                    El estado y los errores se rendereaan arriba (overlay
                    dentro del panel, no del propio botón). */}
                <VoiceButton
                  ref={voiceButtonRef}
                  disabled={loading}
                  onTranscript={(text) => {
                    setInput(prev => prev ? `${prev} ${text}` : text)
                    setTimeout(() => textareaRef.current?.focus(), 50)
                  }}
                  onStateChange={setVoiceState}
                  onError={setVoiceError}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-white shrink-0 transition-all mb-0.5"
                  style={{ background: input.trim() && !loading ? 'linear-gradient(135deg, var(--accent2, #1B3A6B) 0%, var(--accent, #1a6b5a) 100%)' : '#cbd5e1' }}
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Botón flotante ─────────────────────────────────────────────────── */}
      {/* bottom usa calc + env(safe-area-inset-bottom) para que el home
          indicator del iPhone en PWA standalone no se solape con el FAB.
          data-tour="tour-manguito" es el anchor del step 5 del TourOverlay
          (components/tour-overlay.tsx) — antes apuntaba a un selector
          inexistente y el tooltip caía centrado sin spotlight. */}
      <div
        data-tour="tour-manguito"
        className="fixed z-50 flex items-center gap-3"
        style={{ right: 24, bottom: 'calc(24px + env(safe-area-inset-bottom))' }}
      >
        {/* Label visible cuando el panel está cerrado Y el tour no está
            activo (durante el tour, el tooltip describe qué es el Manguito,
            sumar el label encima genera overlap visual confuso). */}
        {!open && !tourActive && (
          <span
            className="text-white text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap pointer-events-none"
            style={{
              background: 'var(--sidebar-bg, #07192b)',
              boxShadow:  '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            Hablar con Manguito
          </span>
        )}
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center justify-center transition-all duration-200"
          style={{
            width:        72,
            height:       72,
            borderRadius: '50%',
            background:   open
              ? 'linear-gradient(135deg, var(--sidebar-bg, #374151) 0%, #1f2937 100%)'
              : 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent, #1a6b5a) 100%)',
            boxShadow:    open
              ? '0 4px 20px rgba(0,0,0,0.3)'
              : '0 4px 24px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.15)',
            transform:    'scale(1)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          title={open ? 'Cerrar Manguito' : 'Abrir Manguito'}
        >
          {open
            ? <X size={24} className="text-white" />
            : <Image src="/manguito.png" alt="Manguito" width={48} height={48} style={{ objectFit: 'contain' }} />
          }
        </button>
      </div>
    </>
  )
}
