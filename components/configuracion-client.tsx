'use client'

import { useState, useEffect } from 'react'
import {
  User, Shield, Palette, Moon, Sun, Check,
  ChevronRight, Mail, KeyRound, ShieldCheck, ShieldAlert,
  Info, Loader2, Smartphone, Bell, CalendarClock,
  Copy, RefreshCw, Filter, AtSign,
} from 'lucide-react'
import {
  THEMES, ThemeKey, applyTheme,
  STORAGE_THEME, useTheme,
} from '@/components/theme-provider'
import { createClient } from '@/lib/supabase/client'
import type { UserPreferences } from '@/app/api/user-preferences/route'

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  icon, title, description, children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        {children}
      </div>
    </div>
  )
}

// ─── Row inside a section ─────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-slate-600 shrink-0">{label}</p>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ─── MFA section ─────────────────────────────────────────────────────────────
type MfaStatus = 'checking' | 'none' | 'enrolling' | 'verifying' | 'enrolled'

function MfaSection() {
  const [status, setStatus]         = useState<MfaStatus>('checking')
  const [factorId, setFactorId]     = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [qrSvg, setQrSvg]           = useState('')
  const [secret, setSecret]         = useState('')
  const [code, setCode]             = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [confirmUnenroll, setConfirmUnenroll] = useState(false)

  // Check enrolled factors on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.find((f: any) => f.status === 'verified')
      if (verified) {
        setFactorId(verified.id)
        setStatus('enrolled')
      } else {
        setStatus('none')
      }
    }).catch(() => setStatus('none'))
  }, [])

  const handleEnroll = async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Finanzas LB',
    })
    setLoading(false)
    if (err || !data) { setError(err?.message ?? 'Error al generar el QR'); return }
    setQrSvg(data.totp.qr_code)
    setSecret(data.totp.secret)
    setFactorId(data.id)
    setStatus('enrolling')
  }

  const handleVerify = async () => {
    if (!factorId || code.length !== 6) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: cData, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr || !cData) { setLoading(false); setError(cErr?.message ?? 'Error al generar desafío'); return }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: cData.id,
      code,
    })
    setLoading(false)
    if (vErr) { setError(vErr.message ?? 'Código incorrecto. Intentá de nuevo.'); return }
    setStatus('enrolled')
    setCode('')
    setQrSvg('')
    setSecret('')
  }

  const handleUnenroll = async () => {
    if (!factorId) return
    if (!confirmUnenroll) { setConfirmUnenroll(true); return }
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.mfa.unenroll({ factorId })
    setLoading(false)
    setFactorId(null)
    setConfirmUnenroll(false)
    setStatus('none')
  }

  // ── Checking ──────────────────────────────────────────────────────────────
  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
        <Loader2 size={15} className="animate-spin" />
        Verificando configuración…
      </div>
    )
  }

  // ── Enrolled ──────────────────────────────────────────────────────────────
  if (status === 'enrolled') {
    return (
      <>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Autenticación TOTP</p>
          <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1 rounded-full font-medium">
            <ShieldCheck size={11} /> Configurado
          </span>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-2.5">
          <ShieldCheck size={15} className="text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-700 leading-relaxed">
            Tu cuenta está protegida con autenticación de dos factores. Cada vez que iniciás sesión necesitás tu app autenticadora.
          </p>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          onClick={handleUnenroll}
          disabled={loading}
          className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            confirmUnenroll
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'text-red-400 hover:bg-red-50 border border-red-100'
          }`}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          {loading ? 'Desvinculando…' : confirmUnenroll ? '¿Confirmar desvincular?' : 'Desvincular autenticador'}
        </button>
        {confirmUnenroll && (
          <p className="text-xs text-center text-slate-400">
            Esto eliminará el MFA de tu cuenta ·{' '}
            <button onClick={() => setConfirmUnenroll(false)} className="underline">cancelar</button>
          </p>
        )}
      </>
    )
  }

  // ── Enrolling: show QR ────────────────────────────────────────────────────
  if (status === 'enrolling') {
    return (
      <>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Autenticación TOTP</p>
          <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1 rounded-full font-medium">
            <ShieldAlert size={11} /> Pendiente de verificación
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Smartphone size={15} className="text-slate-500" />
            Escanear con tu app autenticadora
          </p>

          {/* QR code */}
          {qrSvg && (
            <div
              className="flex justify-center p-4 bg-white rounded-xl border border-slate-200"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}

          {/* Manual secret */}
          <div>
            <p className="text-xs text-slate-500 mb-1.5">O ingresá la clave manual:</p>
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs text-slate-700 break-all select-all">
              {secret}
            </div>
          </div>
        </div>

        {/* 6-digit code input */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-600">Ingresá el código de 6 dígitos para verificar</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
            placeholder="000000"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-2xl font-mono tracking-[0.4em] text-center outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white text-slate-800"
          />
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button
            onClick={handleVerify}
            disabled={loading || code.length !== 6}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {loading ? 'Verificando…' : 'Verificar y activar'}
          </button>
        </div>

        <button
          onClick={() => { setStatus('none'); setQrSvg(''); setSecret(''); setCode(''); setError('') }}
          className="w-full text-sm text-slate-400 hover:text-slate-600 py-1"
        >
          Cancelar
        </button>
      </>
    )
  }

  // ── None: prompt to enroll ────────────────────────────────────────────────
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">Autenticación TOTP</p>
        <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1 rounded-full font-medium">
          <ShieldAlert size={11} /> No configurado
        </span>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-2.5">
        <Info size={15} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700 leading-relaxed">
          El MFA agrega una capa extra de seguridad: además de tu contraseña, necesitás un código generado por una app como <strong>Google Authenticator</strong> o <strong>Authy</strong> cada vez que iniciás sesión.
        </p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <button
        onClick={handleEnroll}
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-70 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
        {loading ? 'Generando QR…' : 'Configurar autenticador'}
      </button>
    </>
  )
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-[var(--accent,#94184A)]' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Notifications section ────────────────────────────────────────────────────
function NotificacionesSection() {
  const [prefs, setPrefs]       = useState<UserPreferences | null>(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  // Load on mount
  useEffect(() => {
    fetch('/api/user-preferences')
      .then(r => r.json())
      .then((data: UserPreferences) => { setPrefs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async (updated: UserPreferences) => {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch('/api/user-preferences', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      setPrefs(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const updateAndSave = (patch: Partial<UserPreferences>) => {
    if (!prefs) return
    const updated = { ...prefs, ...patch }
    setPrefs(updated)
    save(updated)
  }

  const toggleDia = (dia: number) => {
    if (!prefs) return
    const dias = prefs.alerta_vencimientos_dias.includes(dia)
      ? prefs.alerta_vencimientos_dias.filter(d => d !== dia)
      : [...prefs.alerta_vencimientos_dias, dia].sort((a, b) => a - b)
    updateAndSave({ alerta_vencimientos_dias: dias })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
        <Loader2 size={15} className="animate-spin" /> Cargando preferencias…
      </div>
    )
  }

  if (!prefs) {
    return (
      <p className="text-sm text-slate-400">
        No se pudieron cargar las preferencias. Asegurate de haber ejecutado la migración SQL.
      </p>
    )
  }

  const DIAS = [
    { value: 0, label: 'El día del vencimiento',  sublabel: '(día 0)' },
    { value: 1, label: '1 día antes',              sublabel: '' },
    { value: 3, label: '3 días antes',             sublabel: '' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Vencimientos ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-sm font-medium text-slate-700">Alertas de vencimientos</p>
            <p className="text-xs text-slate-400 mt-0.5">Recordatorios de gastos fijos por email</p>
          </div>
          <Toggle
            checked={prefs.alerta_vencimientos_activa}
            onChange={v => updateAndSave({ alerta_vencimientos_activa: v })}
            disabled={saving}
          />
        </div>

        {prefs.alerta_vencimientos_activa && (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <CalendarClock size={12} /> ¿Cuándo querés recibir el recordatorio?
            </p>
            {DIAS.map(({ value, label, sublabel }) => {
              const active = prefs.alerta_vencimientos_dias.includes(value)
              return (
                <button
                  key={value}
                  onClick={() => toggleDia(value)}
                  disabled={saving}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left disabled:opacity-50 ${
                    active
                      ? 'border-[var(--accent,#94184A)] bg-white'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-medium ${active ? 'text-slate-800' : 'text-slate-500'}`}>
                      {label}
                    </span>
                    {sublabel && (
                      <span className="ml-1.5 text-xs text-slate-400">{sublabel}</span>
                    )}
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                      active
                        ? 'bg-[var(--accent,#94184A)] border-[var(--accent,#94184A)]'
                        : 'border-slate-300'
                    }`}
                  >
                    {active && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Resumen semanal ───────────────────────────────────────────────── */}
      <div className="border-t border-slate-50 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Resumen semanal</p>
            <p className="text-xs text-slate-400 mt-0.5">Email los lunes con tus gastos e ingresos de la semana</p>
          </div>
          <Toggle
            checked={prefs.alerta_resumen_semanal}
            onChange={v => updateAndSave({ alerta_resumen_semanal: v })}
            disabled={saving}
          />
        </div>
      </div>

      {/* ── Resumen mensual ───────────────────────────────────────────────── */}
      <div className="border-t border-slate-50 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Resumen mensual</p>
            <p className="text-xs text-slate-400 mt-0.5">Informe el 1° de cada mes con el resumen del mes anterior</p>
          </div>
          <Toggle
            checked={prefs.alerta_resumen_mensual}
            onChange={v => updateAndSave({ alerta_resumen_mensual: v })}
            disabled={saving}
          />
        </div>
      </div>

      {/* ── Status ───────────────────────────────────────────────────────── */}
      <div className="h-5">
        {saving && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" /> Guardando…
          </div>
        )}
        {saved && !saving && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <Check size={12} strokeWidth={3} /> Guardado
          </div>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  )
}

// ─── Email Inbound section ────────────────────────────────────────────────────
const INBOUND_DOMAIN = 'sinunmango.com.ar'

// URL del video tutorial — dejá en null hasta que esté grabado
const TUTORIAL_VIDEO_URL: string | null = null

function EmailInboundSection() {
  const [token, setToken]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [regenerating, setReg]      = useState(false)
  const [copied, setCopied]         = useState(false)
  const [verCode, setVerCode]       = useState<string | null>(null)
  const [showSteps, setShowSteps]   = useState(false)
  const [waitingCode, setWaitingCode] = useState(false)

  const fetchToken = async (silent = false) => {
    try {
      const res  = await fetch('/api/email-inbound-token')
      const data = await res.json()
      setToken(data.token ?? null)
      const code = data.gmail_verification_code ?? null
      setVerCode(code)
      return code
    } catch { /* ignore */
      return null
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Poll each 4 s while waitingCode is true, stop when code arrives
  useEffect(() => {
    if (!waitingCode) return
    const id = setInterval(async () => {
      const code = await fetchToken(true)
      if (code) {
        setWaitingCode(false)
        clearInterval(id)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [waitingCode])

  useEffect(() => { fetchToken() }, [])

  const handleRegenerate = async () => {
    if (!confirm('¿Regenerar la dirección? Tendrías que actualizar el filtro de Gmail.')) return
    setReg(true)
    const res  = await fetch('/api/email-inbound-token', { method: 'POST' })
    const data = await res.json()
    setToken(data.token ?? null)
    setVerCode(null)
    setWaitingCode(false)
    setReg(false)
  }

  const handleWaitForCode = () => {
    setWaitingCode(true)
    setShowSteps(true)
  }

  const address = token ? `${token}@${INBOUND_DOMAIN}` : null

  const handleCopy = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
        <Loader2 size={15} className="animate-spin" /> Cargando…
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Dirección de recepción */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-1">Tu dirección de reenvío</p>
        <p className="text-xs text-slate-400 mb-3">
          Reenviá las notificaciones de tu banco a esta dirección y los movimientos se van a registrar solos.
        </p>

        {address ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 min-w-0 overflow-hidden">
              <AtSign size={14} className="text-slate-400 shrink-0" />
              <span className="truncate font-mono text-sm text-slate-700">{address}</span>
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="shrink-0 p-2.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Regenerar dirección"
            >
              <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-red-500">No se pudo generar la dirección. Recargá la página.</p>
        )}
      </div>

      {/* Estado: ya verificado — mostrar arriba de todo */}
      {verCode === 'VERIFIED' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-2.5">
          <ShieldCheck size={15} className="text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Reenvío de Gmail confirmado ✓</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Los emails de tu banco se van a reenviar automáticamente y los movimientos se van a registrar solos.
            </p>
          </div>
        </div>
      )}

      {/* Video tutorial o placeholder */}
      {TUTORIAL_VIDEO_URL ? (
        <div className="rounded-xl overflow-hidden border border-slate-200 aspect-video">
          <iframe
            src={TUTORIAL_VIDEO_URL}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <span className="text-xl">▶️</span>
          </div>
          <p className="text-sm font-medium text-slate-600">Tutorial en video — próximamente</p>
          <p className="text-xs text-slate-400">Mientras tanto, seguí los pasos de abajo.</p>
        </div>
      )}

      {/* Pasos — colapsables */}
      {verCode !== 'VERIFIED' && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSteps(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Filter size={13} className="text-slate-400" />
              Cómo configurar el reenvío automático en Gmail
            </span>
            <ChevronRight size={14} className={`text-slate-400 transition-transform ${showSteps ? 'rotate-90' : ''}`} />
          </button>

          {showSteps && (
            <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50">
              {[
                { n: 1, text: <>Abrí un email de notificación de tu banco en Gmail.</> },
                { n: 2, text: <>Hacé clic en los tres puntos <strong>(⋮)</strong> y elegí <strong>"Filtrar mensajes así"</strong>.</> },
                { n: 3, text: <>En el campo <strong>De</strong>, escribí el dominio de tu banco (ej: <code className="bg-white px-1 rounded text-xs">@infomistarjetas.com</code>). Hacé clic en <strong>"Crear filtro"</strong>.</> },
                { n: 4, text: <>Tildá <strong>"Reenviar a"</strong>, agregá tu dirección de arriba y confirmá. Gmail te va a mandar un email de verificación.</> },
                { n: 5, text: <>Volvé acá y hacé clic en el botón de abajo. Vamos a confirmar el reenvío automáticamente. ¡Listo! 🎉</> },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-3 text-xs text-slate-700 leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold mt-0.5">{n}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Botón / estado — siempre al pie de la sección de pasos */}
          <div className={`${showSteps ? 'border-t border-slate-100' : ''} p-3`}>
            {verCode?.startsWith('https://') ? (
              <a
                href={verCode}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
              >
                Confirmar reenvío en Gmail →
              </a>
            ) : waitingCode ? (
              <div className="flex items-center justify-center gap-2.5 py-2 text-sm text-blue-600">
                <Loader2 size={14} className="animate-spin" />
                Esperando confirmación de Gmail…
              </div>
            ) : (
              <button
                onClick={handleWaitForCode}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Mail size={14} />
                Ya configuré el filtro en Gmail
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ConfiguracionClient({
  email,
  createdAt,
}: {
  email: string
  createdAt: string | null
}) {
  // ── Theme ──────────────────────────────────────────────────────────────────
  const [activeTheme, setActiveTheme] = useState<ThemeKey>(() => {
    if (typeof window === 'undefined') return 'verde'
    return (localStorage.getItem(STORAGE_THEME) as ThemeKey) ?? 'verde'
  })

  const handleTheme = (key: ThemeKey) => {
    setActiveTheme(key)
    applyTheme(key)
    localStorage.setItem(STORAGE_THEME, key)
  }

  // ── Dark mode — usa el mismo contexto que el toggle del sidebar ────────────
  const { isDark: darkMode, toggleDark } = useTheme()

  const handleDarkMode = (val: boolean) => {
    if (val !== darkMode) toggleDark()
  }

  // ── Reset password ─────────────────────────────────────────────────────────
  const [resetState, setResetState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')

  const handleResetPassword = async () => {
    if (!email) return
    setResetState('loading')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })
    setResetState(error ? 'error' : 'sent')
    if (!error) setTimeout(() => setResetState('idle'), 5000)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const joinDate = createdAt
    ? new Date(createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── PERFIL ─────────────────────────────────────────────────────────── */}
      <Section
        icon={<User size={16} />}
        title="Perfil"
        description="Información de tu cuenta"
      >
        <Row label="Email">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-0">
            <Mail size={14} className="text-slate-400 shrink-0" />
            <span className="text-sm text-slate-700 truncate">{email || '—'}</span>
          </div>
        </Row>

        {joinDate && (
          <Row label="Miembro desde">
            <span className="text-sm text-slate-500">{joinDate}</span>
          </Row>
        )}

        <Row label="Contraseña">
          <div className="flex items-center justify-end">
            {resetState === 'sent' ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                <Check size={14} /> Email enviado
              </div>
            ) : (
              <button
                onClick={handleResetPassword}
                disabled={resetState === 'loading'}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                <KeyRound size={14} />
                {resetState === 'loading' ? 'Enviando…' : 'Restablecer contraseña'}
                <ChevronRight size={13} className="text-slate-300" />
              </button>
            )}
            {resetState === 'error' && (
              <p className="text-xs text-red-500 ml-3">Error al enviar el email</p>
            )}
          </div>
        </Row>
      </Section>

      {/* ── SEGURIDAD / MFA ────────────────────────────────────────────────── */}
      <Section
        icon={<Shield size={16} />}
        title="Seguridad"
        description="Autenticación de dos factores (MFA)"
      >
        <MfaSection />
      </Section>

      {/* ── NOTIFICACIONES ─────────────────────────────────────────────────── */}
      <Section
        icon={<Bell size={16} />}
        title="Notificaciones"
        description="Alertas y reportes por email"
      >
        <NotificacionesSection />
      </Section>

      {/* ── EMAIL INBOUND ──────────────────────────────────────────────────── */}
      <Section
        icon={<AtSign size={16} />}
        title="Importación automática"
        description="Recibí movimientos bancarios sin hacer nada"
      >
        <EmailInboundSection />
      </Section>

      {/* ── APARIENCIA ─────────────────────────────────────────────────────── */}
      <Section
        icon={<Palette size={16} />}
        title="Apariencia"
        description="Colores y modo de visualización"
      >
        {/* Theme presets */}
        <div>
          <p className="text-sm font-medium text-slate-600 mb-3">Color de acento</p>
          <div className="flex items-center gap-3 flex-wrap">
            {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, theme]) => (
              <button
                key={key}
                onClick={() => handleTheme(key)}
                className="flex flex-col items-center gap-1.5 group"
                title={theme.label}
              >
                <div
                  className="w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${theme.accent2} 0%, ${theme.accent} 100%)`,
                    borderColor: activeTheme === key ? theme.accent : 'transparent',
                    boxShadow: activeTheme === key ? `0 0 0 3px ${theme.accent}33` : 'none',
                  }}
                >
                  {activeTheme === key && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
                <span className={`text-xs transition-colors ${activeTheme === key ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {theme.label}
                </span>
              </button>
            ))}
          </div>
          {activeTheme !== 'verde' && (
            <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
              <Check size={10} className="text-emerald-500" />
              Tema <strong>{THEMES[activeTheme].label}</strong> aplicado. Se guarda automáticamente.
            </p>
          )}
        </div>

        {/* Dark mode */}
        <div className="border-t border-slate-50 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-0.5">Modo de visualización</p>
              <p className="text-xs text-slate-400">Se guarda automáticamente.</p>
            </div>
            <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
              <button
                onClick={() => handleDarkMode(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  !darkMode
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Sun size={14} /> Claro
              </button>
              <button
                onClick={() => handleDarkMode(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  darkMode
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Moon size={14} /> Oscuro
              </button>
            </div>
          </div>

        </div>
      </Section>

    </div>
  )
}
