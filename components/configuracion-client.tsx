'use client'

import { useState, useEffect } from 'react'
import {
  User, Shield, Palette, Moon, Sun, Check,
  ChevronRight, Mail, KeyRound, ShieldCheck, ShieldAlert,
  Info, Loader2, Smartphone,
} from 'lucide-react'
import {
  THEMES, ThemeKey, applyTheme, applyDarkMode,
  STORAGE_THEME, STORAGE_DARKMODE,
} from '@/components/theme-provider'
import { createClient } from '@/lib/supabase/client'

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

  // ── Dark mode ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_DARKMODE) === 'true'
  })

  const handleDarkMode = (val: boolean) => {
    setDarkMode(val)
    applyDarkMode(val)
    localStorage.setItem(STORAGE_DARKMODE, String(val))
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
