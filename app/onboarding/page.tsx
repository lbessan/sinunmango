'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle, ChevronRight,
  Check, Plus, X, Sun, Moon, Upload, FileText, Loader2,
} from 'lucide-react'
import { CuentaFormClient } from '@/components/cuenta-form-client'
import { CARD_NETWORKS, BANKS, bankBannerUrl, type BankEntry } from '@/constants/banks'
import { BankSelector } from '@/components/bank-selector'
import {
  THEMES, type ThemeKey, STORAGE_THEME, STORAGE_DARKMODE,
  applyTheme, applyDarkMode,
} from '@/components/theme-provider'
import { calcularPeriodoCuenta as calcularPeriodo } from '@/lib/tarjeta-periodo'
import { LimitReachedModal, tryParseLimitReached, type LimitReachedInfo } from '@/components/limit-reached-modal'

// ─── Variantes de tarjeta ─────────────────────────────────────────────────────

const CARD_VARIANTS = [
  { id: 'standard',  label: 'Standard'  },
  { id: 'gold',      label: 'Gold'      },
  { id: 'platinum',  label: 'Platinum'  },
  { id: 'signature', label: 'Signature' },
  { id: 'black',     label: 'Black'     },
  { id: 'infinite',  label: 'Infinite'  },
]

// ─── Emojis para categorías ───────────────────────────────────────────────────

const EMOJI_OPTS = [
  '🛒','🍔','🚗','🏠','⚡','💊','💉','🎬','👔','📱',
  '🎓','✈️','🐾','🏋️','💄','🎁','🔧','📝','📺','💼',
  '💻','📈','🏘️','💸','🍕','☕','🎮','🏥','🛍️','⛽',
  '💡','🔑','📦','🎵','🍷','🚌','🏦','🎯','🌱','🐶',
  '🍼','🧴','🎪','🏖️','🚀','🧠','🎸','🍎','🌍','💰',
]

// ─── Categorías por defecto ───────────────────────────────────────────────────
//
// IMPORTANTE: los iconos de las primeras 21 categorías DEBEN matchear a las
// del trigger handle_new_user (ver docs/migration-seed-categorias-en-trigger.sql).
// El trigger crea esas filas atómicamente al sign-up con un icono. El onboarding
// dedupea por tipo+nombre, así que si los iconos no matchean el del trigger
// "gana" y el user termina con un emoji distinto al que vio en la UI.
//
// Las 3 últimas de Gasto (Alquiler/Expensas, Educación, Belleza) NO están en
// el trigger seed — solo se crean si el user las elige en este onboarding.

const DEFAULT_CATS = [
  // Gastos — primeros 16 alineados con el seed del trigger
  { nombre: 'Supermercado',          icono: '🛒', tipo: 'Gasto'   },
  { nombre: 'Restaurantes',          icono: '🍽️', tipo: 'Gasto'   },
  { nombre: 'Transporte',            icono: '🚗', tipo: 'Gasto'   },
  { nombre: 'Servicios',             icono: '💡', tipo: 'Gasto'   },
  { nombre: 'Salud',                 icono: '🏥', tipo: 'Gasto'   },
  { nombre: 'Farmacia',              icono: '💊', tipo: 'Gasto'   },
  { nombre: 'Entretenimiento',       icono: '🎬', tipo: 'Gasto'   },
  { nombre: 'Ropa',                  icono: '👕', tipo: 'Gasto'   },
  { nombre: 'Telecomunicaciones',    icono: '📱', tipo: 'Gasto'   },
  { nombre: 'Viajes',                icono: '✈️', tipo: 'Gasto'   },
  { nombre: 'Mascotas',              icono: '🐶', tipo: 'Gasto'   },
  { nombre: 'Gym / Deporte',         icono: '🏋️', tipo: 'Gasto'   },
  { nombre: 'Regalos',               icono: '🎁', tipo: 'Gasto'   },
  { nombre: 'Hogar',                 icono: '🏠', tipo: 'Gasto'   },
  { nombre: 'Impuestos',             icono: '📑', tipo: 'Gasto'   },
  { nombre: 'Suscripciones',         icono: '📺', tipo: 'Gasto'   },
  // Gastos extra — no están en el trigger seed (opt-in del onboarding)
  { nombre: 'Alquiler / Expensas',   icono: '🏘️', tipo: 'Gasto'   },
  { nombre: 'Educación',             icono: '🎓', tipo: 'Gasto'   },
  { nombre: 'Belleza',               icono: '💄', tipo: 'Gasto'   },
  // Ingresos — alineados con el seed del trigger
  { nombre: 'Sueldo',                icono: '💰', tipo: 'Ingreso'  },
  { nombre: 'Freelance',             icono: '💼', tipo: 'Ingreso'  },
  { nombre: 'Alquiler cobrado',      icono: '🏘️', tipo: 'Ingreso'  },
  { nombre: 'Inversiones',           icono: '📈', tipo: 'Ingreso'  },
  { nombre: 'Transferencia recibida',icono: '↗️', tipo: 'Ingreso'  },
] as const

const TOTAL_STEPS = 4

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
  })
}

// calcularPeriodo importado de @/lib/tarjeta-periodo (alias de calcularPeriodoCuenta)

function buildDate(day: string): string | null {
  const d = parseInt(day)
  if (!day || isNaN(d)) return null
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape de una transacción parseada por /api/parsear-tarjeta-pdf.
type PdfTransaccion = {
  fecha:        string
  detalle:      string
  monto_ars:    number | null
  monto_usd:    number | null
  cuotas:       number
  cuotas_total: number
  ya_existe?:   boolean
  es_impuesto?: boolean
  es_descuento?: boolean
}

type PdfCard = {
  banco:      string
  red:        string
  variante:   string
  terminacion:string
  diaCierre:  string
  diaVence:   string
  nombre:     string
  transacciones: PdfTransaccion[]
  importConsumos: boolean
  error?: string
}

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

// ─── Mini variant selector ────────────────────────────────────────────────────

function VariantSelector({
  networkId, value, onChange,
}: { networkId: string; value: string; onChange: (v: string) => void }) {
  if (!networkId) return null
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Variante</label>
      <div className="flex flex-wrap gap-2">
        {CARD_VARIANTS.map(v => {
          const active = value === v.id
          return (
            <button
              key={v.id}
              onClick={() => onChange(v.id)}
              className="relative flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all"
              style={active
                ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, white)' }
                : { borderColor: '#e2e8f0' }}
            >
              <img
                src={`/cards/${networkId}-${v.id}.png`}
                alt={v.label}
                className="w-12 h-8 object-cover rounded"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <span className="text-xs font-medium" style={active ? { color: 'var(--accent)' } : { color: '#64748b' }}>
                {v.label}
              </span>
              {active && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--accent)' }}>
                  <Check size={10} color="#fff" strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Compact network + variant selector (for PDF review) ─────────────────────

function CompactNetworkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CARD_NETWORKS.map(net => (
        <button
          key={net.id}
          onClick={() => onChange(net.id)}
          className="px-2.5 py-1 rounded-lg border-2 text-xs font-medium transition-all"
          style={value === net.id
            ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }
            : { borderColor: '#e2e8f0', color: '#94a3b8' }}
        >
          {net.nombre}
        </button>
      ))}
    </div>
  )
}

function CompactVariantSelect({ networkId, value, onChange }: { networkId: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CARD_VARIANTS.map(v => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className="px-2.5 py-1 rounded-lg border-2 text-xs font-medium transition-all"
          style={value === v.id
            ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, white)', color: 'var(--accent)' }
            : { borderColor: '#e2e8f0', color: '#94a3b8' }}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

// ─── Onboarding page ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // ── Step 2: Tarjeta (manual) ────────────────────────────────────────────────
  const [skipTarjeta,   setSkipTarjeta]   = useState(false)
  const [tarjetaBank,   setTarjetaBank]   = useState<BankEntry | null>(null)
  const [networkId,     setNetworkId]     = useState('')
  const [variantId,     setVariantId]     = useState('standard')
  const [tarjetaNombre, setTarjetaNombre] = useState('')
  const [terminacion,   setTerminacion]   = useState('')
  const [fechaCierre,   setFechaCierre]   = useState('')
  const [fechaVence,    setFechaVence]    = useState('')
  const [savingTarjeta, setSavingTarjeta] = useState(false)
  const [errorTarjeta,  setErrorTarjeta]  = useState<string | null>(null)

  // ── Step 2: PDF import mode ─────────────────────────────────────────────────
  const [importMode,    setImportMode]    = useState(false)
  const [pdfStep,       setPdfStep]       = useState<'upload' | 'review'>('upload')
  const [parsedCards,   setParsedCards]   = useState<PdfCard[]>([])
  const [parsingPdfs,   setParsingPdfs]   = useState(false)
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0 })
  const [limitInfo,     setLimitInfo]     = useState<LimitReachedInfo | null>(null)
  const [savingImport,  setSavingImport]  = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  // ── Step 3: Categorías ──────────────────────────────────────────────────────
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

  // ── Handlers: Manual tarjeta ─────────────────────────────────────────────────

  const handleCrearTarjeta = async () => {
    if (!tarjetaNombre.trim()) { setErrorTarjeta('Ingresá un nombre para la tarjeta'); return }
    if (!networkId) { setErrorTarjeta('Seleccioná la red de la tarjeta'); return }
    setSavingTarjeta(true); setErrorTarjeta(null)

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
        imagen_url:                networkId ? `/cards/${networkId}-${variantId}.png` : null,
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

  // ── Handlers: PDF import ─────────────────────────────────────────────────────

  const handleAnalyzePdfs = async () => {
    if (!selectedFiles.length) return
    setParsingPdfs(true)
    setParseProgress({ done: 0, total: selectedFiles.length })

    const results: PdfCard[] = []
    for (const file of selectedFiles) {
      try {
        const base64 = await fileToBase64(file)
        const res    = await fetch('/api/parsear-tarjeta-pdf', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pdf: base64 }),
        })
        const limitReached = await tryParseLimitReached(res)
        if (limitReached) {
          setLimitInfo(limitReached)
          window.dispatchEvent(new Event('usage:changed'))
          break  // salimos del loop; los PDFs procesados antes se mantienen en results
        }
        if (res.ok) {
          window.dispatchEvent(new Event('usage:changed'))
          const data = await res.json()
          results.push({
            banco:          data.tarjeta?.banco       ?? '',
            red:            data.tarjeta?.red         ?? '',
            variante:       data.tarjeta?.variante    ?? 'standard',
            terminacion:    data.tarjeta?.terminacion ?? '',
            diaCierre:      String(data.tarjeta?.dia_cierre      ?? ''),
            diaVence:       String(data.tarjeta?.dia_vencimiento ?? ''),
            nombre:         data.tarjeta?.nombre_sugerido ?? file.name.replace('.pdf', ''),
            transacciones:  data.transacciones ?? [],
            importConsumos: true,
          })
        } else {
          results.push({
            banco: '', red: '', variante: 'standard', terminacion: '',
            diaCierre: '', diaVence: '',
            nombre: file.name.replace('.pdf', ''),
            transacciones: [], importConsumos: false,
            error: 'No se pudo procesar este PDF',
          })
        }
      } catch {
        results.push({
          banco: '', red: '', variante: 'standard', terminacion: '',
          diaCierre: '', diaVence: '',
          nombre: file.name.replace('.pdf', ''),
          transacciones: [], importConsumos: false,
          error: 'Error al leer el archivo',
        })
      }
      setParseProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setParsedCards(results)
    setParsingPdfs(false)
    setPdfStep('review')
  }

  const updateCard = <K extends keyof PdfCard>(i: number, field: K, value: PdfCard[K]) => {
    setParsedCards(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  const handleCrearDesdePdfs = async () => {
    setSavingImport(true)

    for (let i = 0; i < parsedCards.length; i++) {
      const card = parsedCards[i]
      if (card.error) continue

      // Find matching bank for color/banner
      const matchedBank = BANKS.find(b =>
        b.nombre.toLowerCase().includes(card.banco.toLowerCase()) ||
        card.banco.toLowerCase().includes(b.id)
      )

      const tarjetaRes = await fetch('/api/tarjetas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_cuenta:             card.nombre || `Tarjeta ${i + 1}`,
          institucion:               card.banco  || null,
          moneda:                    'ARS',
          saldo_inicial:             0,
          activa:                    true,
          color_primario:            matchedBank?.color ?? '#1e293b',
          imagen_url:                card.red ? `/cards/${card.red}-${card.variante}.png` : null,
          imagen_banner_url:         matchedBank?.id ? bankBannerUrl(matchedBank.id) : null,
          terminacion_tarjeta:       card.terminacion || null,
          fecha_cierre_tarjeta:      buildDate(card.diaCierre),
          fecha_vencimiento_tarjeta: buildDate(card.diaVence),
        }),
      })

      if (!tarjetaRes.ok) continue

      // Import consumos if enabled
      if (card.importConsumos && card.transacciones.length > 0) {
        const tarjetaData = await tarjetaRes.json()
        const cuentaId    = tarjetaData.id

        const cuentaFake = {
          tipo_cuenta:               'Tarjeta Credito',
          fecha_cierre_tarjeta:      buildDate(card.diaCierre),
          fecha_vencimiento_tarjeta: buildDate(card.diaVence),
        }

        const movimientos = card.transacciones
          .filter(tx => !tx.ya_existe)
          .map(tx => {
            const moneda  = tx.monto_usd !== null && tx.monto_usd !== undefined ? 'USD' : 'ARS'
            const monto   = moneda === 'USD' ? (tx.monto_usd ?? 0) : (tx.monto_ars ?? 0)
            const tipoMov = tx.es_descuento ? 'Ingreso' : 'Gasto'
            const periodo = calcularPeriodo(tx.fecha, cuentaFake)
            return {
              id:              crypto.randomUUID(),
              fecha:           tx.fecha,
              detalle:         tx.detalle,
              monto:           Math.abs(monto),
              moneda,
              cotizacion:      null,
              conciliado:      false,
              cuenta_origen:   cuentaId,
              tipo_movimiento: tipoMov,
              periodo_tarjeta: periodo,
              cuota_actual:    tx.cuotas       ?? 1,
              cuotas_total:    tx.cuotas_total ?? 1,
              ciclo_actual:    1,
            }
          })

        if (movimientos.length > 0) {
          const movsRes = await fetch('/api/movimientos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(movimientos),
          })
          if (!movsRes.ok) {
            const err = await movsRes.json().catch(() => ({}))
            console.error('[onboarding] Error al importar movimientos:', err)
          }
        }
      }
    }

    setSavingImport(false)
    setStep(3)
  }

  // ── Handlers: Categorías ──────────────────────────────────────────────────────

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

    // Traer categorías existentes para no duplicar si el onboarding se corrió más de una vez
    const existingRes = await fetch('/api/categorias').catch(() => null)
    const existing: { nombre_categoria: string; tipo_default: string }[] =
      existingRes?.ok ? await existingRes.json() : []
    const existingKeys = new Set(
      existing.map(c => `${c.tipo_default}::${c.nombre_categoria.trim().toLowerCase()}`)
    )

    const selected  = DEFAULT_CATS.filter((_, i) => selectedCats.has(i))
    const toCreate  = [...selected, ...extraCats].filter(cat =>
      !existingKeys.has(`${cat.tipo}::${cat.nombre.trim().toLowerCase()}`)
    )

    await Promise.all(
      toCreate.map(cat =>
        fetch('/api/categorias', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ nombre_categoria: cat.nombre, tipo_default: cat.tipo, icono: cat.icono }),
        })
      )
    )
    setSavingCats(false)
    setStep(4)
  }

  // ── Handlers: Tema ────────────────────────────────────────────────────────────

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
                tipo_cuenta: 'Banco CA', saldo_inicial: '0',
                activa: true, imagen_url: '', imagen_banner_url: '', color_primario: '#0d3b6e',
                terminacion_tarjeta: '',
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

            {skipTarjeta ? (
              /* ── Skip state ─────────────────────────────────────────────── */
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

            ) : importMode ? (
              /* ── PDF import mode ─────────────────────────────────────────── */
              <>
                {pdfStep === 'upload' && (
                  <div className="space-y-4">
                    {/* File drop zone */}
                    <div
                      className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-slate-300 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={28} className="mx-auto text-slate-300 mb-3" />
                      <p className="text-sm font-medium text-slate-600 mb-1">
                        Seleccioná uno o varios resúmenes PDF
                      </p>
                      <p className="text-xs text-slate-400">
                        La IA va a detectar banco, red, variante, fechas y consumos
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={e => setSelectedFiles(Array.from(e.target.files ?? []))}
                    />

                    {selectedFiles.length > 0 && (
                      <div className="space-y-1.5">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                            <FileText size={14} className="text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-700 flex-1 truncate">{f.name}</span>
                            <button
                              onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                              className="text-slate-300 hover:text-slate-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {parsingPdfs && (
                      <div className="bg-blue-50 rounded-xl p-4 text-center">
                        <Loader2 size={20} className="animate-spin mx-auto text-blue-400 mb-2" />
                        <p className="text-sm font-medium text-blue-600">
                          Analizando {parseProgress.done + 1} de {parseProgress.total}…
                        </p>
                        <p className="text-xs text-blue-400 mt-0.5">Esto puede tardar unos segundos por resumen</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setImportMode(false); setSelectedFiles([]) }}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl"
                      >
                        ← Cargar manualmente
                      </button>
                      <button
                        onClick={handleAnalyzePdfs}
                        disabled={parsingPdfs || !selectedFiles.length}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}
                      >
                        {parsingPdfs ? 'Analizando…' : `Analizar ${selectedFiles.length ? `(${selectedFiles.length})` : ''} →`}
                      </button>
                    </div>
                  </div>
                )}

                {pdfStep === 'review' && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      Revisá la información detectada y editá lo que haga falta.
                    </p>

                    <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
                      {parsedCards.map((card, i) => (
                        <div key={i} className={`border rounded-xl p-4 space-y-3 ${card.error ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                          {/* Card image preview */}
                          {!card.error && card.red && (
                            <div className="flex items-center gap-3">
                              <img
                                src={`/cards/${card.red}-${card.variante}.png`}
                                alt=""
                                className="w-16 h-10 object-cover rounded-lg"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-700">{card.nombre || '(sin nombre)'}</p>
                                <p className="text-xs text-slate-400">
                                  {card.transacciones.length} consumo{card.transacciones.length !== 1 ? 's' : ''} detectado{card.transacciones.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          )}

                          {card.error ? (
                            <p className="text-sm text-red-500">{card.error}</p>
                          ) : (
                            <>
                              {/* Nombre */}
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre</label>
                                <input
                                  type="text"
                                  value={card.nombre}
                                  onChange={e => updateCard(i, 'nombre', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                                />
                              </div>

                              {/* Banco */}
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Banco</label>
                                <input
                                  type="text"
                                  value={card.banco}
                                  onChange={e => updateCard(i, 'banco', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                                />
                              </div>

                              {/* Red */}
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Red</label>
                                <CompactNetworkSelect value={card.red} onChange={v => updateCard(i, 'red', v)} />
                              </div>

                              {/* Variante */}
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Variante</label>
                                <CompactVariantSelect networkId={card.red} value={card.variante} onChange={v => updateCard(i, 'variante', v)} />
                              </div>

                              {/* Terminacion + dias */}
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Terminación</label>
                                  <input
                                    type="text" maxLength={4}
                                    value={card.terminacion}
                                    onChange={e => updateCard(i, 'terminacion', e.target.value.replace(/\D/g, ''))}
                                    placeholder="1234"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center tracking-widest focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Día cierre</label>
                                  <input
                                    type="number" min={1} max={31}
                                    value={card.diaCierre}
                                    onChange={e => updateCard(i, 'diaCierre', e.target.value)}
                                    placeholder="25"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Día vence</label>
                                  <input
                                    type="number" min={1} max={31}
                                    value={card.diaVence}
                                    onChange={e => updateCard(i, 'diaVence', e.target.value)}
                                    placeholder="5"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none"
                                  />
                                </div>
                              </div>

                              {/* Import consumos toggle */}
                              {card.transacciones.length > 0 && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={card.importConsumos}
                                    onChange={e => updateCard(i, 'importConsumos', e.target.checked)}
                                    className="w-4 h-4 accent-[var(--accent)]"
                                  />
                                  <span className="text-xs text-slate-600">
                                    Importar {card.transacciones.length} consumo{card.transacciones.length !== 1 ? 's' : ''} del resumen
                                  </span>
                                </label>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setPdfStep('upload')}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl"
                      >
                        ← Volver
                      </button>
                      <button
                        onClick={handleCrearDesdePdfs}
                        disabled={savingImport}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}
                      >
                        {savingImport
                          ? 'Creando…'
                          : `Crear ${parsedCards.filter(c => !c.error).length} tarjeta${parsedCards.filter(c => !c.error).length !== 1 ? 's' : ''} →`}
                      </button>
                    </div>
                  </div>
                )}
              </>

            ) : (
              /* ── Manual mode ─────────────────────────────────────────────── */
              <>
                <div className="space-y-4">
                  <BankSelector
                    value={tarjetaBank?.id ?? ''}
                    onChange={b => {
                      setTarjetaBank(b.id ? b : null)
                      if (b.id && !tarjetaNombre) setTarjetaNombre(b.nombre)
                    }}
                    label="Banco emisor (opcional)"
                  />

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

                  {/* Variante — solo si hay red seleccionada */}
                  {networkId && (
                    <VariantSelector
                      networkId={networkId}
                      value={variantId}
                      onChange={setVariantId}
                    />
                  )}

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

                {/* PDF import — opción prominente */}
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs text-center text-slate-400 mb-3">— o también —</p>
                  <button
                    onClick={() => { setImportMode(true); setPdfStep('upload'); setSelectedFiles([]) }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-[var(--accent)] hover:bg-slate-50 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'color-mix(in srgb, var(--accent) 10%, white)' }}>
                      <FileText size={18} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-[var(--accent)] transition-colors">
                        Importar desde resúmenes PDF
                      </p>
                      <p className="text-xs text-slate-400">
                        Subí los PDFs y la IA detecta banco, red, variante y carga los consumos
                      </p>
                    </div>
                  </button>
                </div>
              </>
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

            {/* Agregar nueva categoría */}
            {showNewCatForm ? (
              <div className="border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                {/* Emoji picker grid */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Ícono</label>
                  <div className="grid grid-cols-10 gap-1 mb-2">
                    {EMOJI_OPTS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => setNewCatIcono(emoji)}
                        title={emoji}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all hover:scale-110"
                        style={newCatIcono === emoji
                          ? { background: 'color-mix(in srgb, var(--accent) 12%, white)', outline: '2px solid var(--accent)', outlineOffset: '1px' }
                          : { background: '#f8fafc' }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {/* Fallback: custom emoji input */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">O escribí uno:</span>
                    <input
                      type="text"
                      value={newCatIcono}
                      onChange={e => setNewCatIcono(e.target.value)}
                      className="w-12 border border-slate-200 rounded-lg px-2 py-1 text-center text-base focus:outline-none"
                      maxLength={2}
                    />
                    <span className="text-xl">{newCatIcono}</span>
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newCatNombre}
                    onChange={e => setNewCatNombre(e.target.value)}
                    placeholder="Nombre de la categoría"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleAgregarExtraCat()}
                  />
                </div>

                {/* Tipo + acciones */}
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
                    <button
                      onClick={() => { setShowNewCatForm(false); setNewCatNombre(''); setNewCatIcono('📦') }}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
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

      <LimitReachedModal info={limitInfo} onClose={() => setLimitInfo(null)} />
    </div>
  )
}
