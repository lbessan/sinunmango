'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, ChevronRight, Landmark, Wallet, CreditCard, DollarSign } from 'lucide-react'
import { BankSelector, CardNetworkSelector, BankLogo } from '@/components/bank-selector'
import { bankLogoUrl, cardImageUrl, type BankEntry, type CardNetwork } from '@/constants/banks'

// ─── Tipos de cuenta ──────────────────────────────────────────────────────────
const TIPOS = [
  { id: 'Billetera/Banco', label: 'Banco o billetera', sub: 'Mercado Pago, Galicia, Brubank...', icon: <Landmark size={20} /> },
  { id: 'Efectivo',        label: 'Efectivo en pesos',  sub: 'Dinero físico ARS',                icon: <Wallet size={20} /> },
  { id: 'Efectivo-USD',    label: 'Efectivo en dólares', sub: 'Dinero físico USD',               icon: <DollarSign size={20} /> },
  { id: 'Tarjeta Credito', label: 'Tarjeta de crédito', sub: 'Visa, Mastercard, Amex...',        icon: <CreditCard size={20} /> },
] as const

type TipoId = typeof TIPOS[number]['id']

export default function OnboardingPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [step, setStep]         = useState<1 | 2>(1)
  const [tipo, setTipo]         = useState<TipoId | ''>('')
  const [nombre, setNombre]     = useState('')
  const [saldo, setSaldo]       = useState('0')
  const [bank, setBank]         = useState<BankEntry | null>(null)
  const [network, setNetwork]   = useState<CardNetwork | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Cuando seleccionan un banco, auto-completar el nombre si está vacío
  const handleBankChange = (b: BankEntry) => {
    setBank(b.id ? b : null)
    if (b.id && !nombre) setNombre(b.nombre)
  }

  // Imagen y color que se guardan en la cuenta
  const resolvedImageUrl = () => {
    if (tipo === 'Tarjeta Credito' && network) return cardImageUrl(network.id)
    if (bank?.id) return bankLogoUrl(bank.id)
    return ''
  }
  const resolvedColor = () => {
    if (tipo === 'Tarjeta Credito' && network) return network.color
    if (bank?.id) return bank.color
    return '#475569'
  }

  const handleCrearCuenta = async () => {
    if (!nombre.trim()) { setError('Ingresá un nombre para la cuenta'); return }
    setSaving(true); setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { router.replace('/login'); return }

    const tipoReal   = tipo === 'Efectivo-USD' ? 'Efectivo' : tipo as string
    const monedaReal = tipo === 'Efectivo-USD' ? 'USD' : 'ARS'

    const { error: err } = await supabase.from('cuentas').insert({
      nombre_cuenta:   nombre.trim(),
      tipo_cuenta:     tipoReal,
      moneda:          monedaReal,
      saldo_inicial:   parseFloat(saldo) || 0,
      activa:          true,
      user_id:         session.user.id,
      imagen_url:      resolvedImageUrl() || null,
      color_primario:  resolvedColor(),
    })

    setSaving(false)
    if (err) { setError('No se pudo crear la cuenta. Intentá de nuevo.'); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'var(--bg-main)' }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Logo" className="w-14 h-14 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800 mb-1">¡Bienvenido a sinunmango!</h1>
          <p className="text-slate-500 text-sm">Configurá tu primera cuenta para empezar</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={step >= s
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: '#f1f5f9', color: '#94a3b8' }}
              >
                {step > s ? <CheckCircle size={14} /> : s}
              </div>
              {s < 2 && (
                <div className="w-10 h-0.5 transition-colors"
                  style={{ background: step > s ? 'var(--accent)' : '#e2e8f0' }} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">

          {/* ── PASO 1: Tipo de cuenta ───────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="text-sm font-semibold text-slate-700 mb-4">¿Qué tipo de cuenta querés crear primero?</h2>
              <div className="space-y-2">
                {TIPOS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTipo(t.id)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                      tipo === t.id ? 'border-[var(--accent)]' : 'border-slate-100 hover:border-slate-200'
                    }`}
                    style={tipo === t.id ? { background: 'color-mix(in srgb, var(--accent) 6%, white)' } : {}}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                      style={tipo === t.id
                        ? { background: 'var(--accent)', color: '#fff' }
                        : { background: '#f1f5f9', color: '#64748b' }}
                    >
                      {t.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                      <p className="text-xs text-slate-400">{t.sub}</p>
                    </div>
                    {tipo === t.id && <ChevronRight size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => router.push('/dashboard')} className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600">
                  Saltear
                </button>
                <button
                  onClick={() => tipo && setStep(2)}
                  disabled={!tipo}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                  style={{ background: 'var(--accent)' }}
                >
                  Continuar
                </button>
              </div>
            </>
          )}

          {/* ── PASO 2: Datos de la cuenta ───────────────────────────────── */}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="text-xs text-slate-400 hover:text-slate-600 mb-4">
                ← Volver
              </button>

              <h2 className="text-sm font-semibold text-slate-700 mb-5">
                {TIPOS.find(t => t.id === tipo)?.label}
              </h2>

              <div className="space-y-4">

                {/* ── Selector de banco (Billetera/Banco y Tarjeta) ── */}
                {(tipo === 'Billetera/Banco' || tipo === 'Tarjeta Credito') && (
                  <BankSelector
                    value={bank?.id ?? ''}
                    onChange={handleBankChange}
                    label={tipo === 'Tarjeta Credito' ? 'Banco emisor' : 'Banco o billetera'}
                  />
                )}

                {/* ── Selector de red (solo tarjetas) ── */}
                {tipo === 'Tarjeta Credito' && (
                  <CardNetworkSelector
                    value={network?.id ?? ''}
                    onChange={setNetwork}
                  />
                )}

                {/* ── Nombre de la cuenta ── */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Nombre de la cuenta
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder={
                      tipo === 'Tarjeta Credito'
                        ? bank ? `${network?.nombre ?? 'Visa'} ${bank.nombre}` : 'Ej: Visa Galicia'
                        : tipo === 'Billetera/Banco'
                        ? bank?.nombre ?? 'Ej: Mercado Pago'
                        : tipo === 'Efectivo-USD' ? 'Efectivo USD' : 'Efectivo ARS'
                    }
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                  />
                </div>

                {/* ── Saldo inicial (no para tarjetas) ── */}
                {tipo !== 'Tarjeta Credito' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Saldo actual {tipo === 'Efectivo-USD' ? '(USD)' : '(ARS)'}
                    </label>
                    <input
                      type="number"
                      value={saldo}
                      onChange={e => setSaldo(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">Podés ajustarlo después</p>
                  </div>
                )}

                {/* ── Preview de la cuenta que se va a crear ── */}
                {nombre.trim() && (
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    {tipo === 'Tarjeta Credito' && network ? (
                      <div
                        className="rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                        style={{ width: 56, height: 36, background: network.color }}
                      >
                        <img src={cardImageUrl(network.id)} alt={network.nombre}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                    ) : bank?.id ? (
                      <BankLogo id={bank.id} nombre={bank.nombre} color={bank.color} size={36} />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-slate-200 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{nombre}</p>
                      <p className="text-xs text-slate-400">
                        {tipo === 'Efectivo-USD' ? 'Efectivo · USD' : tipo === 'Tarjeta Credito' ? 'Tarjeta de crédito' : tipo} ·{' '}
                        {tipo === 'Efectivo-USD' ? 'USD' : 'ARS'}
                      </p>
                    </div>
                    <div className="ml-auto w-3 h-3 rounded-full shrink-0" style={{ background: resolvedColor() }} />
                  </div>
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => router.push('/dashboard')} className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600">
                  Saltear
                </button>
                <button
                  onClick={handleCrearCuenta}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {saving ? 'Creando...' : 'Crear cuenta →'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-300 mt-5">
          Podés agregar más cuentas en cualquier momento desde Cuentas
        </p>
      </div>
    </div>
  )
}
