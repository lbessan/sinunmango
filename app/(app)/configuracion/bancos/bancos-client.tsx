'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Pencil, X, Check, Landmark } from 'lucide-react'
import { BANKS, bankIconUrl, type BankEntry } from '@/constants/banks'
import { ImagenUploader } from '@/components/imagen-uploader'
import { DeleteButton } from '@/components/delete-button'

type BancoCustom = {
  id: string
  nombre: string
  color: string
  imagen_url: string | null
  imagen_banner_url: string | null
}

// ── Logo component ────────────────────────────────────────────────────────────

function BankLogo({ id, nombre, color, size = 36, imagenUrl }: {
  id: string; nombre: string; color: string; size?: number; imagenUrl?: string | null
}) {
  const [err, setErr] = useState(false)
  const src = imagenUrl || (id ? bankIconUrl(id) : null)

  if (!src || err) {
    return (
      <div style={{ width: size, height: size, backgroundColor: color, borderRadius: 8, flexShrink: 0 }}
        className="flex items-center justify-center text-white font-bold">
        <span style={{ fontSize: size * 0.4 }}>{nombre.charAt(0).toUpperCase()}</span>
      </div>
    )
  }
  return (
    <img src={src} alt={nombre} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: '#f1f5f9' }} />
  )
}

// ── Form para agregar/editar un banco custom ──────────────────────────────────

function BancoCustomForm({ banco, onSaved, onCancel }: {
  banco?: BancoCustom
  onSaved: (b: BancoCustom) => void
  onCancel: () => void
}) {
  const isEditing   = !!banco
  const [nombre,    setNombre]    = useState(banco?.nombre ?? '')
  const [color,     setColor]     = useState(banco?.color ?? '#475569')
  const [imagenUrl, setImagenUrl] = useState(banco?.imagen_url ?? '')
  const [bannerUrl, setBannerUrl] = useState(banco?.imagen_banner_url ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const tempId = useRef(banco?.id ?? `banco_${Date.now()}`)

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')

    const body = { nombre: nombre.trim(), color, imagen_url: imagenUrl || null, imagen_banner_url: bannerUrl || null }

    let id = banco?.id
    const res = isEditing
      ? await fetch(`/api/bancos-custom/${banco!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/bancos-custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error'); return }
    if (!isEditing) { const d = await res.json(); id = d.id }
    onSaved({ id: id!, ...body })
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">
        {isEditing ? `Editar: ${banco!.nombre}` : 'Agregar banco o billetera personalizado'}
      </h3>

      {/* Preview */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-3">
        <BankLogo id={tempId.current} nombre={nombre || '?'} color={color} size={40} imagenUrl={imagenUrl || null} />
        <div>
          <p className="text-sm font-semibold text-slate-800">{nombre || 'Nombre del banco'}</p>
          <p className="text-xs text-slate-400">Personalizado</p>
        </div>
        <div className="ml-auto w-5 h-5 rounded-full shrink-0" style={{ background: color }} />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Nombre *</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Brubank, Naranja X, Lemon..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none bg-white" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Color de marca</label>
        <div className="flex items-center gap-3">
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white shrink-0" />
          <input type="text" value={color} onChange={e => setColor(e.target.value)}
            placeholder="#475569"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono bg-white focus:outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <ImagenUploader
            valor={imagenUrl}
            onChange={setImagenUrl}
            label="Ícono cuadrado"
            carpeta="bancos"
            id={tempId.current + '-icon'}
          />
          <p className="text-[10px] text-slate-400 mt-1">Recomendado: 200×200 px</p>
        </div>
        <div>
          <ImagenUploader
            valor={bannerUrl}
            onChange={setBannerUrl}
            label="Logo / banner"
            carpeta="bancos"
            id={tempId.current + '-banner'}
          />
          <p className="text-[10px] text-slate-400 mt-1">Recomendado: 600×200 px</p>
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-2">PNG con fondo transparente · máx 2 MB</p>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-white">
          Cancelar
        </button>
        <button onClick={handleGuardar} disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
          {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Agregar banco'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BancosClient({ bancosCustom: initialCustom }: { bancosCustom: BancoCustom[] }) {
  const router = useRouter()
  const [search,       setSearch]       = useState('')
  const [bancosCustom, setBancosCustom] = useState(initialCustom)
  const [showForm,     setShowForm]     = useState(false)
  const [editando,     setEditando]     = useState<BancoCustom | null>(null)

  const filtered = search.trim()
    ? BANKS.filter(b => b.nombre.toLowerCase().includes(search.toLowerCase()))
    : BANKS

  const filteredCustom = search.trim()
    ? bancosCustom.filter(b => b.nombre.toLowerCase().includes(search.toLowerCase()))
    : bancosCustom

  const TIPO_LABELS: Record<string, string> = {
    banco:     'Bancos',
    billetera: 'Billeteras virtuales',
    crypto:    'Cripto / Fintech',
  }

  const grouped = (['banco', 'billetera', 'crypto'] as const).reduce((acc, tipo) => {
    acc[tipo] = filtered.filter(b => b.tipo === tipo)
    return acc
  }, {} as Record<string, BankEntry[]>)

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Mis bancos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Bancos disponibles en el selector. Agregá los que falten.
          </p>
        </div>
        {!showForm && !editando && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
            <Plus size={15} />Agregar banco
          </button>
        )}
      </div>

      {/* Formulario agregar / editar */}
      {(showForm || editando) && (
        <BancoCustomForm
          banco={editando ?? undefined}
          onSaved={b => {
            if (editando) {
              setBancosCustom(prev => prev.map(x => x.id === b.id ? b : x))
            } else {
              setBancosCustom(prev => [...prev, b])
            }
            setShowForm(false); setEditando(null)
          }}
          onCancel={() => { setShowForm(false); setEditando(null) }}
        />
      )}

      {/* Buscador */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
        <Search size={15} className="text-slate-400 shrink-0" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar banco o billetera..."
          className="flex-1 text-sm text-slate-800 bg-transparent outline-none placeholder:text-slate-400" />
        {search && <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500"><X size={13} /></button>}
      </div>

      {/* Bancos personalizados */}
      {filteredCustom.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">✦ Personalizados</span>
            <span className="text-xs text-amber-500">{filteredCustom.length}</span>
          </div>
          {filteredCustom.map(b => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
              <BankLogo id={b.id} nombre={b.nombre} color={b.color} size={36} imagenUrl={b.imagen_url} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">{b.nombre}</p>
                <p className="text-xs text-slate-400">Personalizado</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditando(b); setShowForm(false) }}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                  <Pencil size={14} />
                </button>
                <DeleteButton
                  endpoint={`/api/bancos-custom/${b.id}`}
                  label={b.nombre}
                  description="El banco personalizado se eliminará. Las cuentas existentes no se ven afectadas."
                  variant="icon"
                  onSuccess={() => setBancosCustom(prev => prev.filter(x => x.id !== b.id))}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de bancos de fábrica */}
      {(Object.keys(TIPO_LABELS) as ('banco' | 'billetera' | 'crypto')[]).map(tipo => {
        const lista = grouped[tipo] ?? []
        if (!lista.length) return null
        return (
          <div key={tipo} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{TIPO_LABELS[tipo]}</p>
            </div>
            {lista.map(bank => (
              <div key={bank.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                <BankLogo id={bank.id} nombre={bank.nombre} color={bank.color} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{bank.nombre}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-4 h-4 rounded-full" style={{ background: bank.color }} />
                  <span className="text-xs text-slate-300">incluido</span>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {filtered.length === 0 && filteredCustom.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Landmark size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No encontramos "{search}"</p>
          <button onClick={() => setShowForm(true)}
            className="mt-3 text-sm font-medium" style={{ color: 'var(--accent)' }}>
            Agregarlo como banco personalizado →
          </button>
        </div>
      )}
    </div>
  )
}
