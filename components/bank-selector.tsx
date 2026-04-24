'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { BANKS, CARD_NETWORKS, bankLogoUrl, cardImageUrl, type BankEntry, type CardNetwork } from '@/constants/banks'

// ─── BankLogo: muestra logo si existe, sino muestra inicial con color ────────
export function BankLogo({ id, nombre, color, size = 36, isCard = false }: {
  id: string; nombre: string; color: string; size?: number; isCard?: boolean
}) {
  const [error, setError] = useState(false)
  const src = isCard ? cardImageUrl(id) : bankLogoUrl(id)
  const initial = nombre.charAt(0).toUpperCase()

  if (error) {
    return (
      <div
        style={{ width: size, height: size, backgroundColor: color, borderRadius: 8, flexShrink: 0 }}
        className="flex items-center justify-center text-white font-bold"
      >
        <span style={{ fontSize: size * 0.4 }}>{initial}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={nombre}
      width={size}
      height={size}
      onError={() => setError(true)}
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: '#f1f5f9' }}
    />
  )
}

// ─── BankSelector: selector con búsqueda para bancos/billeteras ──────────────
type BankSelectorProps = {
  value:    string         // bankId seleccionado
  onChange: (bank: BankEntry) => void
  label?:   string
}

const TIPO_LABELS: Record<BankEntry['tipo'], string> = {
  banco:     'Bancos',
  billetera: 'Billeteras virtuales',
  crypto:    'Cripto / fintech',
}

export function BankSelector({ value, onChange, label = 'Banco o billetera' }: BankSelectorProps) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref                 = useRef<HTMLDivElement>(null)

  const selected = BANKS.find(b => b.id === value)

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = search.trim()
    ? BANKS.filter(b => b.nombre.toLowerCase().includes(search.toLowerCase()))
    : BANKS

  const grouped = BANKS.reduce((acc, b) => {
    if (!acc[b.tipo]) acc[b.tipo] = []
    if (filtered.includes(b)) acc[b.tipo].push(b)
    return acc
  }, {} as Record<BankEntry['tipo'], BankEntry[]>)

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 text-left hover:border-slate-300 transition-colors bg-white"
      >
        {selected ? (
          <>
            <BankLogo id={selected.id} nombre={selected.nombre} color={selected.color} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{selected.nombre}</p>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange({ id: '', nombre: '', color: '', tipo: 'banco' }); setOpen(false) }}
              className="text-slate-300 hover:text-slate-500 shrink-0"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Search size={14} className="text-slate-400" />
            </div>
            <span className="text-sm text-slate-400 flex-1">Buscá tu banco o billetera...</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {(Object.keys(TIPO_LABELS) as BankEntry['tipo'][]).map(tipo => {
              const lista = grouped[tipo] ?? []
              if (lista.length === 0) return null
              return (
                <div key={tipo}>
                  <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    {TIPO_LABELS[tipo]}
                  </p>
                  {lista.map(bank => (
                    <button
                      key={bank.id}
                      type="button"
                      onClick={() => { onChange(bank); setOpen(false); setSearch('') }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left ${
                        value === bank.id ? 'bg-slate-50' : ''
                      }`}
                    >
                      <BankLogo id={bank.id} nombre={bank.nombre} color={bank.color} size={30} />
                      <span className="text-sm text-slate-700 font-medium">{bank.nombre}</span>
                      {value === bank.id && (
                        <span className="ml-auto text-xs font-bold" style={{ color: bank.color }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">
                No encontramos "{search}" — podés seguir sin seleccionar banco.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CardNetworkSelector: selector de red de tarjeta ─────────────────────────
type CardNetworkSelectorProps = {
  value:    string
  onChange: (network: CardNetwork) => void
}

export function CardNetworkSelector({ value, onChange }: CardNetworkSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        Red de la tarjeta
      </label>
      <div className="flex flex-wrap gap-2">
        {CARD_NETWORKS.map(net => {
          const active = value === net.id
          return (
            <button
              key={net.id}
              type="button"
              onClick={() => onChange(net)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                active ? 'text-white' : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
              style={active ? { borderColor: net.color, backgroundColor: net.color } : {}}
            >
              {net.nombre}
            </button>
          )
        })}
      </div>
    </div>
  )
}
