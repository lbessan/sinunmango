'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, User, CheckCircle, AlertCircle, Loader2, Minimize2, Trash2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Message = {
  id:           string
  role:         'user' | 'assistant'
  content:      string
  accion?:      Record<string, unknown>
  accionEstado?: 'pendiente' | 'confirmando' | 'ok' | 'error'
  accionMsg?:   string
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

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ size = 26 }: { size?: number }) {
  return (
    <div className="rounded-full shrink-0 overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, #07192b 0%, #1a6b5a 100%)' }}>
      <img src="/manguito.png" alt="Manguito" style={{ width: size * 0.78, height: size * 0.78, objectFit: 'contain' }} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ManguitoFlotante() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)
  const panelRef                = useRef<HTMLDivElement>(null)

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
        const { error } = await res.json()
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${error}` } : m))
        return
      }

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
              right:        24,
              bottom:       96,
              width:        'min(520px, calc(100vw - 48px))',
              height:       'min(680px, calc(100dvh - 130px))',
              borderRadius: 20,
              background:   '#f8fafc',
              boxShadow:    '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.12)',
              border:       '1px solid rgba(0,0,0,0.08)',
            }}
          >
            {/* Header */}
            <div
              className="shrink-0 flex items-center gap-3 px-4 py-3.5"
              style={{ background: 'linear-gradient(135deg, #07192b 0%, #0f3d2a 100%)' }}
            >
              {/* Avatar grande */}
              <div className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
                style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 0 2px rgba(255,255,255,0.2)' }}>
                <img src="/manguito.png" alt="Manguito" style={{ width: 34, height: 34, objectFit: 'contain' }} />
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
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-700 leading-relaxed shadow-sm max-w-[85%]">
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
                      className="text-left px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
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
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                      msg.role === 'user'
                        ? 'text-white rounded-tr-sm'
                        : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                    }`}
                      style={msg.role === 'user' ? { background: 'var(--accent2, #1B3A6B)' } : {}}
                    >
                      {msg.content || (loading && msg.role === 'assistant'
                        ? <span className="flex gap-1.5 items-center text-slate-400 text-xs">
                            <Loader2 size={11} className="animate-spin" />pensando...
                          </span>
                        : '')}
                    </div>
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

            {/* Input */}
            <div className="shrink-0 px-4 pb-4 pt-2">
              <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 flex gap-2.5 items-end shadow-sm">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribí un mensaje..."
                  rows={1}
                  className="flex-1 resize-none text-sm text-slate-800 outline-none bg-transparent placeholder-slate-400 self-center"
                  style={{ minHeight: 26, maxHeight: 120, lineHeight: '1.5' }}
                  onInput={e => {
                    const t = e.target as HTMLTextAreaElement
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                  }}
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
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed z-50 flex items-center justify-center transition-all duration-200 group"
        style={{
          right:        24,
          bottom:       24,
          width:        60,
          height:       60,
          borderRadius: '50%',
          background:   open
            ? 'linear-gradient(135deg, #374151 0%, #1f2937 100%)'
            : 'linear-gradient(135deg, #07192b 0%, #1a6b5a 100%)',
          boxShadow:    open
            ? '0 4px 20px rgba(0,0,0,0.3)'
            : '0 4px 20px rgba(26,107,90,0.45), 0 2px 8px rgba(0,0,0,0.2)',
          transform:    'scale(1)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        title={open ? 'Cerrar Manguito' : 'Abrir Manguito'}
      >
        {open
          ? <X size={22} className="text-white" />
          : <img src="/manguito.png" alt="Manguito" style={{ width: 38, height: 38, objectFit: 'contain' }} />
        }

        {/* Tooltip */}
        {!open && (
          <span className="absolute right-16 bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            Hablar con Manguito
          </span>
        )}
      </button>
    </>
  )
}
