'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle, ChevronRight,
  Check, Plus, X, Sun, Moon,
} from 'lucide-react'
import { CuentaFormClient } from '@/components/cuenta-form-client'
import { CARD_NETWORKS, bankBannerUrl, type BankEntry } from '@/constants/banks'
import { BankSelector } from '@/components/bank-selector'
import {
  THEMES, type ThemeKey, STORAGE_THEME, STORAGE_DARKMODE,
  applyTheme, applyDarkMode,
} from '@/components/theme-provider'

// ─── Categorías por defecto ───────────────────────────────────────────────────
// Estas se muestran como opciones en el paso 3. Las seleccionadas se crean
// como categorías propias del usuario al finalizar.

const DEFAULT_CATS = [
  // Gastos
  { nombre: 'Supermercado',          icono: '🛒', tipo: 'Gasto'   },
  { nombre: 'Restaurantes',          icono: '🍔', tipo: 'Gasto'   },
  { nombre: 'Transporte',            icono: '🚗', tipo: 'Gasto'   },
  { nombre: 'Alquiler / Expensas',   icono: '🏠', tipo: 'Gasto'   },
  { nombre: 'Servicios',             icono: '⚡', tipo: 'Gasto'   },
  { nombre: 'Salud',                 icono: '💊', tipo: 'Gasto'   },
  { nombre: 'Farmacia',              icono: '💉', tipo: 'Gasto'   },
  { nombre: 'Entretenimiento',       icono: '🎬', tipo: 'Gasto'   },
  { nombre: 'Ropa',                  icono: '👔', tipo: 'Gasto'   },
  { nombre: 'Telecomunicaciones',    icono: '📱', tipo: 'Gasto'   },
  { nombre: 'Educación',             icono: '🎓', tipo: 'Gasto'   },
  { nombre: 'Viajes',                icono: '✈️', tipo: 'Gasto'   },
  { nombre: 'Mascotas',              icono: '🐾', tipo: 'Gasto'   },
  { nombre: 'Gym / Deporte',         icono: '🏋️', tipo: 'Gasto'   },
  { nombre: 'Belleza',               icono: '💄', tipo: 'Gasto'   },
  { nombre: 'Regalos',               icono: '🎁', tipo: 'Gasto'   },
  { nombre: 'Hogar',                 icono: '🔧', tipo: 'Gasto'   },
  { nombre: 'Impuestos',             icono: '📝', tipo: 'Gasto'   },
  { nombre: 'Suscripciones',         icono: '📺', tipo: 'Gasto'   },
  // Ingresos
  { nombre: 'Sueldo',                icono: '💼', tipo: 'Ingreso'  },
  { nombre: 'Freelance',             icono: '💻', tipo: 'Ingreso'  },
  { nombre: 'Inversiones',           icono: '📈', tipo: 'Ingreso'  },
  { nombre: 'Alquiler cobrado',      icono: '🏘️', tipo: 'Ingreso'  },
  { nombre: 'Transferencia recibida',icono: '💸', tipo: 'Ingreso'  },
] as const

const TOTAL_STEPS = 4

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ['Cuenta', 'Tarjeta', 'Categorías', 'Apariencia']
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {Array.from({ length: total }).map((_, i) => {
        const n      = i + 1
        const done   = current > n
        const active = current === n
        return (
          <div key={n} className="flex items-center gap-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={
                done || active
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: '#f1f5f9', color: '#94a3b8' }
              }
            >
              {done ? <CheckCircle size={14} /> : n}
            </div>
            {n < total && (
              <div className="w-8 h-0.5 transition-colors"
                style={{ background: done ? 'var(--accent)' : '#e2e8f0' }} />
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
  // Índices de DEFAULT_CATS que el usuario quiere (todos por defecto)
  const [selectedCats,    setSelectedCats]    = useState<Set<number>>(() => new Set(DEFAULT_CATS.map((_, i) => i)))
  const [newCatNombre,    setNewCatNombre]    = useState('')
  const [newCatTipo,      setNewCatTipo]      = useState<'Gasto' | 'Ingreso'>('Gasto')
  const [newCatIcono,     setNewCatIcono]     = useState('📦')
  const [extraCats,       setExtraCats]       = useState<{ nombre: string; icono: string; tipo: string }[]>([])
  const [showNewCatForm,  setShowNewCatForm]  = useState(false)
  const [savingCats,      setSavingCats]      = useState(false)

  // ── Step 4: Tema ────────────────────────────────────────────────────────────
  const [themeKey, setThemeKey] = useState<ThemeKey>('verde')
  const [isDark,   setIsDark]   = useState(false)

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCrearTarjeta = async () => {
    if (!tarjetaNombre.trim()) { setErrorTarjeta('Ingresá un nombre para la tarjeta'); return }
    if (!networkId) { setErrorTarjeta('Seleccioná la red de la tarjeta'); return }
    setSavingTarjeta(true); setErrorTarjeta(null)

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

  const toggleCat = (i: number) => {
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const handleAgregarExtraCat = () => {
    if (!newCatNombre.trim()) return
    setExtraCats(prev => [...prev, { nombre: newCatNombre.trim(), icono: newCatIcono, tipo: newCatTipo }])
    setNewCatNombre(''); setNewCatIcono('📦'); setShowNewCatForm(false)
  }

  const handleSaveCategorias = async () => {
    setSavingCats(true)

    // Categorías seleccionadas de la lista por defecto
    const selected = DEFAULT_CATS.filter((_, i) => selectedCats.has(i))
    const toCreate = [...selected, ...extraCats]

    await Promise.all(
      toCreate.map(cat =>
        fetch('/api/categorias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre_categoria: cat.nombre, tipo_default: cat.tipo, icono: cat.icono }),
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

  const handleFinish = () => router.push('/dashboard?tour=1')

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-main, #f8fafc)' }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Logo" className="w-14 h-14 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800 mb-1">¡Bienvenido a sinunmango!</h1>
          <p className="text-slate-500 text-sm">Configurá tu espacio en unos pocos pasos</p>
        </div>

        <StepIndicator current={step} total={TOTAL_STEPS} />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 1 */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">Paso 1 · Tu primera cuenta</p>
            <CuentaFormClient
              title="Agregá tu cuenta principal"
              inicial={{
                nombre_cuenta: '', institucion: '', moneda: 'ARS',
                tipo_cuenta: 'Billetera/Banco', saldo_inicial: '0',
                activa: true, imagen_url: '', imagen_banner_url: '', color_primario: '#0d3b6e',
              }}
              onSuccess={() => setStep(2)}
            />
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 2 */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Paso 2 · Tarjeta de crédito</p>
            <h2 className="text-base font-semibold text-slate-800 mb-1">¿Tenés tarjeta de crédito?</h2>
            <p className="text-sm text-slate-500 mb-5">Agregá tu tarjeta principal o saltá este paso.</p>

            {!skipTarjeta ? (
              <>
                <div className="space-y-4">
                  <BankSelector value={tarjetaBank?.id ?? ''} onChange={b => { setTarjetaBank(b.id ? b : null); if (b.id && !tarjetaNombre) setTarjetaNombre(b.nombre) }} label="Banco emisor (opcional)" />

                  {/* Red */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Red</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CARD_NETWORKS.map(net => (
                        <button
                          key={net.id}
                          onClick={() => setNetworkId(net.id)}
                          className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all ${
                            networkId === net.id ? 'border-[var(--accent)]' : 'border-slate-100 hover:border-slate-200'
                          }`}
                          style={networkId === net.id ? { background: 'color-mix(in srgb, var(--accent) 6%, white)' } : {}}
                        >
                          <img
                            src={`/cards/${net.id}-standard.png`}
                            alt={net.nombre}
                            className="w-10 h-7 object-cover rounded"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <span className="text-xs font-medium text-slate-700">{net.nombre}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nombre</label>
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
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">4 últimos</label>
                      <input type="text" maxLength={4} value={terminacion}
                        onChange={e => setTerminacion(e.target.value.replace(/\D/g, ''))}
                        placeholder="1234"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none text-center tracking-widest" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Día cierre</label>
                      <input type="number" min={1} max={31} value={fechaCierre}
                        onChange={e => setFechaCierre(e.target.value)} placeholder="25"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Día vence</label>
                      <input type="number" min={1} max={31} value={fechaVence}
                        onChange={e => setFechaVence(e.target.value)} placeholder="5"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none text-center" />
                    </div>
                  </div>

                  {errorTarjeta && <p className="text-xs text-red-500">{errorTarjeta}</p>}
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setSkipTarjeta(true)}
                    className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl">
                    No tengo tarjeta
                  </button>
                  <button onClick={handleCrearTarjeta} disabled={savingTarjeta}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}>
                    {savingTarjeta ? 'Guardando…' : 'Agregar tarjeta →'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-4xl mb-3">💳</p>
                <p className="text-sm text-slate-500 mb-6">
                  Podés agregar tarjetas en cualquier momento desde el menú{' '}
                  <span className="font-medium text-slate-700">Tarjetas</span>.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setSkipTarjeta(false)}
                    className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl">
                    ← Agregar igual
                  </button>
                  <button onClick={() => setStep(3)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'var(--accent)' }}>
                    Continuar →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 3 */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Paso 3 · Categorías</p>
            <h2 className="text-base font-semibold text-slate-800 mb-1">Elegí tus categorías</h2>
            <p className="text-sm text-slate-500 mb-5">
              Seleccioná las que usás habitualmente. Podés agregar más después.
            </p>

            {/* Gastos */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Gastos</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DEFAULT_CATS.map((c, i) => {
                if (c.tipo !== 'Gasto') return null
                const on = selectedCats.has(i)
                return (
                  <button key={i} onClick={() => toggleCat(i)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-sm transition-all"
                    style={on
                      ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }
                      : { borderColor: '#e2e8f0', background: '#f8fafc', color: '#94a3b8' }}>
                    <span>{c.icono}</span>
                    <span className="font-medium">{c.nombre}</span>
                    {on ? <Check size={12} style={{ color: 'var(--accent)' }} /> : <X size={12} className="text-slate-300" />}
                  </button>
                )
              })}
            </div>

            {/* Ingresos */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Ingresos</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DEFAULT_CATS.map((c, i) => {
                if (c.tipo !== 'Ingreso') return null
                const on = selectedCats.has(i)
                return (
                  <button key={i} onClick={() => toggleCat(i)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-sm transition-all"
                    style={on
                      ? { borderColor: '#10b981', background: '#f0fdf4', color: '#10b981' }
                      : { borderColor: '#e2e8f0', background: '#f8fafc', color: '#94a3b8' }}>
                    <span>{c.icono}</span>
                    <span className="font-medium">{c.nombre}</span>
                    {on ? <Check size={12} className="text-emerald-500" /> : <X size={12} className="text-slate-300" />}
                  </button>
                )
              })}
            </div>

            {/* Extras añadidas por el usuario */}
            {extraCats.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {extraCats.map((c, i) => (
                  <span key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-sm"
                    style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }}>
                    <span>{c.icono}</span>
                    <span className="font-medium">{c.nombre}</span>
                    <button onClick={() => setExtraCats(prev => prev.filter((_, j) => j !== i))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Agregar nueva */}
            {showNewCatForm ? (
              <div className="border border-slate-200 rounded-xl p-3 mb-4 space-y-2">
                <div className="flex gap-2">
                  <input type="text" value={newCatIcono} onChange={e => setNewCatIcono(e.target.value)}
                    placeholder="📦" className="w-12 border border-slate-200 rounded-lg px-2 py-1.5 text-center text-base focus:outline-none" />
                  <input type="text" value={newCatNombre} onChange={e => setNewCatNombre(e.target.value)}
                    placeholder="Nombre de la categoría" className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    {(['Gasto', 'Ingreso'] as const).map(t => (
                      <button key={t} onClick={() => setNewCatTipo(t)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                        style={newCatTipo === t
                          ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                          : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 ml-auto">
                    <button onClick={() => setShowNewCatForm(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button onClick={handleAgregarExtraCat} disabled={!newCatNombre.trim()}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}>
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNewCatForm(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-4">
                <Plus size={13} /> Agregar categoría propia
              </button>
            )}

            <p className="text-xs text-slate-400 mb-4">
              {selectedCats.size + extraCats.length} categorías seleccionadas
            </p>

            <button onClick={handleSaveCategorias} disabled={savingCats}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {savingCats ? 'Guardando…' : 'Continuar →'}
            </button>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PASO 4 */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Paso 4 · Apariencia</p>
            <h2 className="text-base font-semibold text-slate-800 mb-1">Elegí el color de tu app</h2>
            <p className="text-sm text-slate-500 mb-6">Podés cambiarlo cuando quieras desde Configuración.</p>

            {/* Color themes */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Color principal</p>
            <div className="grid grid-cols-5 gap-3 mb-6">
              {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, t]) => (
                <button key={key} onClick={() => handleThemeChange(key)} className="flex flex-col items-center gap-2">
                  <div
                    className="w-12 h-12 rounded-2xl border-4 transition-all flex items-center justify-center"
                    style={{
                      background:  t.preview,
                      borderColor: themeKey === key ? '#fff' : 'transparent',
                      boxShadow:   themeKey === key ? `0 0 0 2px ${t.preview}` : 'none',
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
                { dark: false, label: 'Claro',  icon: <Sun  size={16} /> },
                { dark: true,  label: 'Oscuro', icon: <Moon size={16} /> },
              ].map(m => (
                <button key={String(m.dark)} onClick={() => m.dark !== isDark && handleDarkToggle()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                  style={isDark === m.dark
                    ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }
                    : { borderColor: '#e2e8f0', color: '#94a3b8' }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            <button onClick={handleFinish}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
              ¡Listo, empezar! 🥭
            </button>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-5">
          Podés modificar todo esto en cualquier momento desde Configuración
        </p>
      </div>
    </div>
  )
}
