'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle, ChevronRight, Landmark, Wallet, DollarSign,
  CreditCard, Check, Plus, X, Sun, Moon,
} from 'lucide-react'
import { BankSelector, BankLogo } from '@/components/bank-selector'
import { bankIconUrl, bankBannerUrl, CARD_NETWORKS, type BankEntry } from '@/constants/banks'
import {
  THEMES, type ThemeKey, STORAGE_THEME, STORAGE_DARKMODE,
  applyTheme, applyDarkMode,
} from '@/components/theme-provider'

// ─── Types ────────────────────────────────────────────────────────────────────

type TipoId = 'Billetera/Banco' | 'Efectivo' | 'Efectivo-USD'

interface Categoria {
  id: string
  nombre_categoria: string
  icono: string | null
  tipo_default: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPOS_CUENTA = [
  { id: 'Billetera/Banco' as TipoId, label: 'Banco o billetera',  sub: 'Mercado Pago, Galicia, Brubank…', icon: <Landmark size={20} /> },
  { id: 'Efectivo'        as TipoId, label: 'Efectivo en pesos',   sub: 'Dinero físico ARS',               icon: <Wallet   size={20} /> },
  { id: 'Efectivo-USD'   as TipoId, label: 'Efectivo en dólares', sub: 'Dinero físico USD',               icon: <DollarSign size={20} /> },
]

const TOTAL_STEPS = 4

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ['Cuenta', 'Tarjeta', 'Categorías', 'Apariencia']
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {Array.from({ length: total }).map((_, i) => {
        const n    = i + 1
        const done = current > n
        const active = current === n
        return (
          <div key={n} className="flex items-center gap-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={
                done   ? { background: 'var(--accent)', color: '#fff' } :
                active ? { background: 'var(--accent)', color: '#fff' } :
                         { background: '#f1f5f9', color: '#94a3b8' }
              }
            >
              {done ? <CheckCircle size={14} /> : n}
            </div>
            {n < total && (
              <div className="w-8 h-0.5 transition-colors" style={{ background: done ? 'var(--accent)' : '#e2e8f0' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Onboarding page ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // ── Step 1: Cuenta ──────────────────────────────────────────────────────────
  const [tipo,   setTipo]   = useState<TipoId | ''>('')
  const [nombre, setNombre] = useState('')
  const [saldo,  setSaldo]  = useState('0')
  const [bank,   setBank]   = useState<BankEntry | null>(null)
  const [savingCuenta, setSavingCuenta] = useState(false)
  const [errorCuenta,  setErrorCuenta]  = useState<string | null>(null)
  const [cuentaStep, setCuentaStep]     = useState<1 | 2>(1) // sub-steps dentro del step 1

  // ── Step 2: Tarjeta ─────────────────────────────────────────────────────────
  const [skipTarjeta,   setSkipTarjeta]   = useState(false)
  const [tarjetaBank,   setTarjetaBank]   = useState<BankEntry | null>(null)
  const [networkId,     setNetworkId]     = useState('')
  const [tarjetaNombre, setTarjetaNombre] = useState('')
  const [terminacion,   setTerminacion]   = useState('')
  const [fechaCierre,   setFechaCierre]   = useState('')
  const [fechaVence,    setFechaVence]    = useState('')
  const [savingTarjeta, setSavingTarjeta] = useState(false)
  const [errorTarjeta,  setErrorTarjeta]  = useState<string | null>(null)

  // ── Step 3: Categorías ──────────────────────────────────────────────────────
  const [categorias,      setCategorias]      = useState<Categoria[]>([])
  const [disabledCats,    setDisabledCats]    = useState<Set<string>>(new Set())
  const [newCatNombre,    setNewCatNombre]    = useState('')
  const [newCatTipo,      setNewCatTipo]      = useState<'Gasto' | 'Ingreso'>('Gasto')
  const [newCatIcono,     setNewCatIcono]     = useState('📦')
  const [addingCat,       setAddingCat]       = useState(false)
  const [showNewCatForm,  setShowNewCatForm]  = useState(false)
  const [savingCats,      setSavingCats]      = useState(false)

  // ── Step 4: Tema ────────────────────────────────────────────────────────────
  const [themeKey, setThemeKey] = useState<ThemeKey>('verde')
  const [isDark,   setIsDark]   = useState(false)

  // Fetch categories when entering step 3
  useEffect(() => {
    if (step !== 3) return
    fetch('/api/categorias')
      .then(r => r.json())
      .then((data: Categoria[]) => setCategorias(data))
      .catch(() => {})
  }, [step])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const handleBankChange = (b: BankEntry) => {
    setBank(b.id ? b : null)
    if (b.id && !nombre) setNombre(b.nombre)
  }

  const handleTarjetaBankChange = (b: BankEntry) => {
    setTarjetaBank(b.id ? b : null)
    if (b.id && !tarjetaNombre) setTarjetaNombre(b.nombre)
  }

  const resolvedColor    = () => bank?.color ?? '#475569'
  const resolvedImageUrl = () => (bank?.id ? bankIconUrl(bank.id) : '')

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCrearCuenta = async () => {
    if (!nombre.trim()) { setErrorCuenta('Ingresá un nombre para la cuenta'); return }
    setSavingCuenta(true); setErrorCuenta(null)
    const tipoReal   = tipo === 'Efectivo-USD' ? 'Efectivo' : tipo as string
    const monedaReal = tipo === 'Efectivo-USD' ? 'USD' : 'ARS'
    const res = await fetch('/api/cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre_cuenta:     nombre.trim(),
        tipo_cuenta:       tipoReal,
        moneda:            monedaReal,
        saldo_inicial:     parseFloat(saldo) || 0,
        activa:            true,
        imagen_url:        resolvedImageUrl() || null,
        imagen_banner_url: bank?.id ? bankBannerUrl(bank.id) : null,
        color_primario:    resolvedColor(),
        institucion:       bank?.nombre ?? null,
      }),
    })
    setSavingCuenta(false)
    if (!res.ok) { setErrorCuenta('No se pudo crear la cuenta. Intentá de nuevo.'); return }
    setStep(2)
  }

  const handleCrearTarjeta = async () => {
    if (!tarjetaNombre.trim()) { setErrorTarjeta('Ingresá un nombre para la tarjeta'); return }
    if (!networkId) { setErrorTarjeta('Seleccioná la red de la tarjeta'); return }
    setSavingTarjeta(true); setErrorTarjeta(null)

    // Build ISO date from day-number using current month
    const buildDate = (day: string) => {
      const d = parseInt(day)
      if (!day || isNaN(d)) return null
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }

    const res = await fetch('/api/tarjetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre_cuenta:             tarjetaNombre.trim(),
        institucion:               tarjetaBank?.nombre ?? null,
        moneda:                    'ARS',
        saldo_inicial:             0,
        activa:                    true,
        color_primario:            tarjetaBank?.color ?? '#1e293b',
        imagen_url:                networkId ? `/cards/${networkId}-standard.png` : null,
        imagen_banner_url:         tarjetaBank?.id ? bankBannerUrl(tarjetaBank.id) : null,
        terminacion_tarjeta:       terminacion || null,
        fecha_cierre_tarjeta:      buildDate(fechaCierre),
        fecha_vencimiento_tarjeta: buildDate(fechaVence),
      }),
    })
    setSavingTarjeta(false)
    if (!res.ok) { setErrorTarjeta('No se pudo crear la tarjeta. Intentá de nuevo.'); return }
    setStep(3)
  }

  const toggleCategoria = (id: string) => {
    setDisabledCats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleAgregarCategoria = async () => {
    if (!newCatNombre.trim()) return
    setAddingCat(true)
    const res = await fetch('/api/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_categoria: newCatNombre.trim(), tipo_default: newCatTipo, icono: newCatIcono }),
    })
    if (res.ok) {
      const { id } = await res.json()
      setCategorias(prev => [...prev, { id, nombre_categoria: newCatNombre.trim(), tipo_default: newCatTipo, icono: newCatIcono }])
      setNewCatNombre(''); setNewCatIcono('📦'); setShowNewCatForm(false)
    }
    setAddingCat(false)
  }

  const handleSaveCategorias = async () => {
    setSavingCats(true)
    // Delete the toggled-off ones
    await Promise.all(
      [...disabledCats].map(id =>
        fetch('/api/categorias', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      )
    )
    setSavingCats(false)
    setStep(4)
  }

  const handleThemeChange = (key: ThemeKey) => {
    setThemeKey(key)
    applyTheme(key)
    localStorage.setItem(STORAGE_THEME, key)
  }

  const handleDarkToggle = () => {
    const next = !isDark
    setIsDark(next)
    applyDarkMode(next)
    localStorage.setItem(STORAGE_DARKMODE, String(next))
  }

  const handleFinish = () => {
    router.push('/dashboard?tour=1')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-main)' }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Logo" className="w-14 h-14 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800 mb-1">¡Bienvenido a sinunmango!</h1>
          <p className="text-slate-500 text-sm">Configurá tu espacio en unos pocos pasos</p>
        </div>

        <StepIndicator current={step} total={TOTAL_STEPS} />

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 1 */}
          {step === 1 && (
            <>
              {cuentaStep === 1 ? (
                <>
                  <h2 className="text-base font-semibold text-slate-800 mb-1">Primera cuenta</h2>
                  <p className="text-sm text-slate-500 mb-5">¿Con qué tipo de cuenta querés arrancar?</p>
                  <div className="space-y-2">
                    {TIPOS_CUENTA.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTipo(t.id)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                          tipo === t.id ? 'border-[var(--accent)]' : 'border-slate-100 hover:border-slate-200'
                        }`}
                        style={tipo === t.id ? { background: 'color-mix(in srgb, var(--accent) 6%, white)' } : {}}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
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
                  <button
                    onClick={() => tipo && setCuentaStep(2)}
                    disabled={!tipo}
                    className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                    style={{ background: 'var(--accent)' }}
                  >
                    Continuar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setCuentaStep(1)} className="text-xs text-slate-400 hover:text-slate-600 mb-4 block">
                    ← Volver
                  </button>
                  <h2 className="text-sm font-semibold text-slate-700 mb-5">
                    {TIPOS_CUENTA.find(t => t.id === tipo)?.label}
                  </h2>
                  <div className="space-y-4">
                    {tipo === 'Billetera/Banco' && (
                      <BankSelector value={bank?.id ?? ''} onChange={handleBankChange} label="Banco o billetera" />
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Nombre de la cuenta
                      </label>
                      <input
                        type="text"
                        value={nombre}
                        onChange={e => setNombre(e.target.value)}
                        placeholder={
                          tipo === 'Billetera/Banco' ? (bank?.nombre ?? 'Ej: Mercado Pago') :
                          tipo === 'Efectivo-USD'    ? 'Efectivo USD' : 'Efectivo ARS'
                        }
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                      />
                    </div>
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
                    {nombre.trim() && (
                      <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                        {bank?.id
                          ? <BankLogo id={bank.id} nombre={bank.nombre} color={bank.color} size={36} />
                          : <div className="w-9 h-9 rounded-lg bg-slate-200 shrink-0" />}
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{nombre}</p>
                          <p className="text-xs text-slate-400">
                            {tipo === 'Efectivo-USD' ? 'Efectivo · USD' : tipo} · {tipo === 'Efectivo-USD' ? 'USD' : 'ARS'}
                          </p>
                        </div>
                        <div className="ml-auto w-3 h-3 rounded-full shrink-0" style={{ background: resolvedColor() }} />
                      </div>
                    )}
                    {errorCuenta && <p className="text-xs text-red-500">{errorCuenta}</p>}
                  </div>
                  <button
                    onClick={handleCrearCuenta}
                    disabled={savingCuenta}
                    className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    {savingCuenta ? 'Creando…' : 'Crear cuenta →'}
                  </button>
                </>
              )}
            </>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 2 */}
          {step === 2 && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Tarjeta de crédito</h2>
              <p className="text-sm text-slate-500 mb-5">Agregá tu tarjeta principal o saltá este paso.</p>

              {!skipTarjeta ? (
                <>
                  <div className="space-y-4">
                    <BankSelector value={tarjetaBank?.id ?? ''} onChange={handleTarjetaBankChange} label="Banco emisor (opcional)" />

                    {/* Red */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Red de la tarjeta
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {CARD_NETWORKS.map(net => (
                          <button
                            key={net.id}
                            onClick={() => setNetworkId(net.id)}
                            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                              networkId === net.id ? 'border-[var(--accent)]' : 'border-slate-100 hover:border-slate-200'
                            }`}
                            style={networkId === net.id ? { background: 'color-mix(in srgb, var(--accent) 6%, white)' } : {}}
                          >
                            <img
                              src={`/cards/${net.id}-standard.png`}
                              alt={net.label}
                              className="w-10 h-7 object-cover rounded"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                            <span className="text-xs font-medium text-slate-700">{net.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Nombre de la tarjeta
                      </label>
                      <input
                        type="text"
                        value={tarjetaNombre}
                        onChange={e => setTarjetaNombre(e.target.value)}
                        placeholder={tarjetaBank?.nombre ? `${tarjetaBank.nombre} Visa` : 'Ej: Galicia Visa Signature'}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                          4 últimos dígitos
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          value={terminacion}
                          onChange={e => setTerminacion(e.target.value.replace(/\D/g, ''))}
                          placeholder="1234"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none text-center tracking-widest"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                          Día cierre
                        </label>
                        <input
                          type="number"
                          min={1} max={31}
                          value={fechaCierre}
                          onChange={e => setFechaCierre(e.target.value)}
                          placeholder="25"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                          Día vence
                        </label>
                        <input
                          type="number"
                          min={1} max={31}
                          value={fechaVence}
                          onChange={e => setFechaVence(e.target.value)}
                          placeholder="5"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none text-center"
                        />
                      </div>
                    </div>

                    {errorTarjeta && <p className="text-xs text-red-500">{errorTarjeta}</p>}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => setSkipTarjeta(true)}
                      className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl"
                    >
                      No tengo tarjeta
                    </button>
                    <button
                      onClick={handleCrearTarjeta}
                      disabled={savingTarjeta}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}
                    >
                      {savingTarjeta ? 'Guardando…' : 'Agregar tarjeta →'}
                    </button>
                  </div>
                </>
              ) : (
                // Sin tarjeta
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">💳</p>
                  <p className="text-sm text-slate-500 mb-6">
                    Perfecto, podés agregar tarjetas en cualquier momento desde el menú{' '}
                    <span className="font-medium text-slate-700">Tarjetas</span>.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSkipTarjeta(false)}
                      className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl"
                    >
                      ← Agregar igual
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      Continuar →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 3 */}
          {step === 3 && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Categorías</h2>
              <p className="text-sm text-slate-500 mb-4">
                Estas son tus categorías por defecto. Desactivá las que no usás o agregá nuevas.
              </p>

              {/* Gasto */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Gastos</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {categorias.filter(c => c.tipo_default === 'Gasto').map(c => {
                  const on = !disabledCats.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCategoria(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-sm transition-all"
                      style={on
                        ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }
                        : { borderColor: '#e2e8f0', background: '#f8fafc', color: '#94a3b8' }}
                    >
                      <span>{c.icono ?? '📦'}</span>
                      <span className="font-medium">{c.nombre_categoria}</span>
                      {on
                        ? <Check size={12} style={{ color: 'var(--accent)' }} />
                        : <X     size={12} className="text-slate-300" />}
                    </button>
                  )
                })}
              </div>

              {/* Ingreso */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Ingresos</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {categorias.filter(c => c.tipo_default === 'Ingreso').map(c => {
                  const on = !disabledCats.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCategoria(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-sm transition-all"
                      style={on
                        ? { borderColor: '#10b981', background: '#f0fdf4', color: '#10b981' }
                        : { borderColor: '#e2e8f0', background: '#f8fafc', color: '#94a3b8' }}
                    >
                      <span>{c.icono ?? '📦'}</span>
                      <span className="font-medium">{c.nombre_categoria}</span>
                      {on ? <Check size={12} className="text-emerald-500" /> : <X size={12} className="text-slate-300" />}
                    </button>
                  )
                })}
              </div>

              {/* Agregar nueva */}
              {showNewCatForm ? (
                <div className="border border-slate-200 rounded-xl p-3 mb-4 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCatIcono}
                      onChange={e => setNewCatIcono(e.target.value)}
                      placeholder="📦"
                      className="w-12 border border-slate-200 rounded-lg px-2 py-1.5 text-center text-base focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newCatNombre}
                      onChange={e => setNewCatNombre(e.target.value)}
                      placeholder="Nombre de la categoría"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      {(['Gasto', 'Ingreso'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setNewCatTipo(t)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                          style={newCatTipo === t
                            ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                            : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 ml-auto">
                      <button onClick={() => setShowNewCatForm(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-slate-600">
                        Cancelar
                      </button>
                      <button
                        onClick={handleAgregarCategoria}
                        disabled={addingCat || !newCatNombre.trim()}
                        className="px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                        style={{ background: 'var(--accent)' }}
                      >
                        {addingCat ? '…' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewCatForm(true)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-4"
                >
                  <Plus size={13} /> Agregar categoría
                </button>
              )}

              {disabledCats.size > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                  ⚠ {disabledCats.size} {disabledCats.size === 1 ? 'categoría será eliminada' : 'categorías serán eliminadas'}
                </p>
              )}

              <button
                onClick={handleSaveCategorias}
                disabled={savingCats}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {savingCats ? 'Guardando…' : 'Continuar →'}
              </button>
            </>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 4 */}
          {step === 4 && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Apariencia</h2>
              <p className="text-sm text-slate-500 mb-6">Elegí los colores de tu app. Podés cambiarlo cuando quieras.</p>

              {/* Color themes */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Color principal</p>
              <div className="grid grid-cols-5 gap-3 mb-6">
                {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => handleThemeChange(key)}
                    className="flex flex-col items-center gap-2"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl border-4 transition-all flex items-center justify-center"
                      style={{
                        background:   t.preview,
                        borderColor:  themeKey === key ? '#fff' : 'transparent',
                        boxShadow:    themeKey === key ? `0 0 0 2px ${t.preview}` : 'none',
                      }}
                    >
                      {themeKey === key && <Check size={18} color="#fff" strokeWidth={3} />}
                    </div>
                    <span className="text-xs font-medium text-slate-600">{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Dark mode */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Modo</p>
              <div className="flex gap-3 mb-8">
                {[
                  { id: false, label: 'Claro', icon: <Sun  size={16} /> },
                  { id: true,  label: 'Oscuro', icon: <Moon size={16} /> },
                ].map(m => (
                  <button
                    key={String(m.id)}
                    onClick={() => m.id !== isDark && handleDarkToggle()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                    style={
                      isDark === m.id
                        ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }
                        : { borderColor: '#e2e8f0', color: '#94a3b8' }
                    }
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
              >
                ¡Listo, empezar! 🥭
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-300 mt-5">
          {step < 4 && 'Podés configurar todo esto en cualquier momento desde Ajustes'}
        </p>
      </div>
    </div>
  )
}
