'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, User, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type Message = {
  id:      string
  role:    'user' | 'assistant'
  content: string
  accion?: Record<string, unknown>
  accionEstado?: 'pendiente' | 'confirmando' | 'ok' | 'error'
  accionMsg?: string
}

function parseAccion(text: string): { clean: string; accion: Record<string, unknown> | null } {
  const match = text.match(/<accion>([\s\S]*?)<\/accion>/)
  if (!match) return { clean: text, accion: null }
  try {
    const accion = JSON.parse(match[1].trim())
    const clean  = text.replace(/<accion>[\s\S]*?<\/accion>/, '').trim()
    return { clean, accion }
  } catch {
    return { clean: text, accion: null }
  }
}

function AccionCard({
  accion, estado, msg, onConfirmar, onCancelar,
}: {
  accion:      Record<string, unknown>
  estado:      'pendiente' | 'confirmando' | 'ok' | 'error'
  msg?:        string
  onConfirmar: () => void
  onCancelar:  () => void
}) {
  if (estado === 'ok') return (
    <div className="mt-3 flex items-center gap-2 text-green-600 text-sm">
      <CheckCircle size={16} />
      <span>{msg ?? 'Movimiento registrado'}</span>
    </div>
  )
  if (estado === 'error') return (
    <div className="mt-3 flex items-center gap-2 text-red-500 text-sm">
      <AlertCircle size={16} />
      <span>{msg ?? 'Error al registrar'}</span>
    </div>
  )
  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
      <p className="font-medium text-blue-700 mb-2">¿Registrar este movimiento?</p>
      <div className="text-xs text-blue-600 space-y-0.5 mb-3">
        <p><span className="font-medium">Detalle:</span> {String(accion.detalle ?? '—')}</p>
        <p><span className="font-medium">Monto:</span> ${Number(accion.monto ?? 0).toLocaleString('es-AR')} {String(accion.moneda ?? 'ARS')}</p>
        {Number(accion.cuotas ?? 1) > 1 && <p><span className="font-medium">Cuotas:</span> {String(accion.cuotas)}</p>}
        <p><span className="font-medium">Fecha:</span> {String(accion.fecha ?? '—')}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirmar}
          disabled={estado === 'confirmando'}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--accent, #1a6b5a)' }}
        >
          {estado === 'confirmando'
            ? <><Loader2 size={12} className="animate-spin" /> Guardando...</>
            : '✓ Confirmar'}
        </button>
        <button
          onClick={onCancelar}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200 bg-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

const EJEMPLOS = [
  'Gasté $4.500 en el supermercado con la cuenta de Carrefour',
  '¿Cuánto gasté el mes pasado?',
  'Pagué $12.000 de nafta en efectivo',
  '¿Cuál es mi cuenta con más gastos?',
]

function ManguitoAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        width: size, height: size,
        background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent, #1a6b5a) 100%)',
        boxShadow: '0 0 0 2px rgba(var(--accent-rgb, 26,107,90),0.3)',
      }}
    >
      <img
        src="/manguito.png"
        alt="Manguito"
        style={{ width: size * 0.8, height: size * 0.8, objectFit: 'contain' }}
      />
    </div>
  )
}

export default function AsistentePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/asistente', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: `Error: ${error}` } : m
        ))
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              fullText += parsed.delta.text
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullText } : m
              ))
            }
          } catch { /* ignore malformed lines */ }
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
      if (res.ok && data.ok) {
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, accionEstado: 'ok', accionMsg: `✓ Guardado en ${data.cuenta} — $${Number(data.monto).toLocaleString('es-AR')}` }
            : m
        ))
      } else {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, accionEstado: 'error', accionMsg: data.error } : m
        ))
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, accionEstado: 'error', accionMsg: 'Error de red' } : m
      ))
    }
  }

  const cancelarAccion = (msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, accion: undefined, accionEstado: undefined } : m
    ))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    {/* -mx-4 -mt-4 / lg:-mx-8 lg:-mt-8 escapa el padding del <main>.
        overflow-hidden va acá (no adentro) para que los márgenes negativos no se corten. */}
    <div className="flex flex-col overflow-hidden h-[calc(100dvh-4.5rem)] lg:h-[calc(100dvh-2rem)] -mx-4 -mt-4 lg:-mx-8 lg:-mt-8">

      {/* ── BANNER FULL-BLEED ──────────────────────────────────────────────── */}
      <div
        className="shrink-0 text-white"
        style={{ background: 'linear-gradient(135deg, var(--sidebar-bg, #07192b) 0%, var(--accent2, #1B3A6B) 50%, var(--accent, #1a6b5a) 100%)' }}
      >
        <div className="px-6 lg:px-10 pt-7 pb-5 flex flex-col items-center text-center">
          {/* Logo — más grande, menos margen inferior para acercarlo al nombre */}
          <div
            className="rounded-full flex items-center justify-center mb-2"
            style={{
              width: 96, height: 96,
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 0 0 3px rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <img src="/manguito.png" alt="Manguito" style={{ width: 76, height: 76, objectFit: 'contain' }} />
          </div>

          {/* Nombre — todo mayúsculas */}
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white leading-none mb-1.5" style={{ letterSpacing: '0.05em' }}>
            MANGUITO
          </h1>
          <p className="text-xs text-white/55 font-medium">
            Tu asistente financiero personal — preguntá o dictale un gasto
          </p>
        </div>
      </div>

      {/* ── CHAT SECTION ──────────────────────────────────────────────────────
          flex-1 + min-h-0 para que no desborde el contenedor padre             */}
      <div className="max-w-2xl w-full mx-auto flex flex-col flex-1 min-h-0 pt-5 px-4 lg:px-8">

        {/* Messages — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-3">

          {messages.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <p className="text-sm text-slate-500 mb-3">Podés preguntarme cosas como:</p>
              <div className="grid grid-cols-1 gap-2">
                {EJEMPLOS.map(ej => (
                  <button
                    key={ej}
                    onClick={() => sendMessage(ej)}
                    className="text-left px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                  >
                    {ej}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant'
                ? <ManguitoAvatar size={28} />
                : (
                  <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-slate-600 text-white mt-1">
                    <User size={13} />
                  </div>
                )
              }
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-slate-700 text-white rounded-tr-sm'
                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                }`}>
                  {msg.content || (loading && msg.role === 'assistant'
                    ? <span className="flex gap-1 items-center text-slate-400"><Loader2 size={13} className="animate-spin" /> pensando...</span>
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

        {/* ── INPUT BAR — siempre visible al fondo ──────────────────────────── */}
        <div className="shrink-0 pb-3 pt-2">
          <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 flex gap-2.5 items-center shadow-sm">
            {/* Avatar de Manguito a la izquierda */}
            <ManguitoAvatar size={30} />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí un mensaje... (Enter para enviar)"
              rows={1}
              className="flex-1 resize-none text-sm text-slate-800 outline-none bg-transparent placeholder-slate-400 max-h-32 self-center"
              style={{ minHeight: '28px', lineHeight: '1.5' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 128) + 'px'
              }}
            />

            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="h-9 px-4 rounded-xl flex items-center justify-center gap-2 text-white text-sm font-semibold transition-all shrink-0"
              style={{
                background: input.trim() && !loading
                  ? 'linear-gradient(135deg, var(--accent2, #1B3A6B) 0%, var(--accent, #1a6b5a) 100%)'
                  : '#cbd5e1',
                minWidth: '84px',
              }}
            >
              {loading
                ? <Loader2 size={14} className="animate-spin" />
                : <><Send size={14} /><span>Enviar</span></>
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
