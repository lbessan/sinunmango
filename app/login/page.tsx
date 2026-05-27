'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, Loader2, Mail, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react'

// ─── Tipos de vista del flujo de auth ────────────────────────────────────────
// 'choose'  → pantalla principal con Google + form email/password (login)
// 'signup'  → registro con email/password
// 'forgot'  → form para pedir link de reset
// 'sent'    → confirmación post-signup ("revisá tu email")
// 'reset-sent' → confirmación post-forgot ("revisá tu email para resetear")
type View = 'choose' | 'signup' | 'forgot' | 'sent' | 'reset-sent'

function LoginContent() {
  const supabase     = createClient()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const errorParam   = searchParams.get('error')

  // `next`: a dónde mandar al user después de auth. Lo usa el flow de
  // invite (/invite/[token]?next=/invite/[token]) para que después de
  // signup/login vuelva a aceptar la invitación en vez de ir a /dashboard
  // o /onboarding. Validamos que sea path relativo (no open redirect).
  const nextParamRaw = searchParams.get('next')
  const nextParam = nextParamRaw && nextParamRaw.startsWith('/') && !nextParamRaw.startsWith('//')
    ? nextParamRaw
    : null

  // Para flujos que pasan por el callback (Google OAuth + signup con email
  // de confirmación), inyectamos el next en el redirectTo.
  const callbackUrl = (origin: string) =>
    nextParam
      ? `${origin}/auth/callback?next=${encodeURIComponent(nextParam)}`
      : `${origin}/auth/callback`

  const [view, setView]         = useState<View>('choose')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ── Google OAuth ─────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(window.location.origin) },
    })
    // El browser redirige solo, no hace falta setLoading(false)
  }

  // ── Login email + password ───────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      // Mensajes friendly para los errores más comunes
      if (error.message.includes('Invalid login credentials')) {
        setFormError('Email o contraseña incorrectos.')
      } else if (error.message.includes('Email not confirmed')) {
        setFormError('Confirmá tu email antes de iniciar sesión. Revisá tu bandeja de entrada (y la carpeta de spam).')
      } else {
        setFormError(error.message)
      }
      return
    }
    // Sesión creada — el server lee la cookie en el primer fetch.
    // Si vino `next` (ej. flow de invite link), respetarlo. Sino, /dashboard.
    // refresh() fuerza re-render del layout server-side que ya tiene la sesión.
    router.push(nextParam ?? '/dashboard')
    router.refresh()
  }

  // ── Signup email + password ──────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (password.length < 8) {
      setFormError('La contraseña tiene que tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setFormError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // emailRedirectTo: a donde redirigir cuando el user toque el link del
        // email de confirmación. Va a /auth/callback que hace exchangeCodeForSession
        // y desde ahí redirige a /onboarding o /dashboard (o `next` si vino).
        emailRedirectTo: callbackUrl(window.location.origin),
      },
    })
    setLoading(false)
    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setFormError('Ya existe una cuenta con ese email. Probá iniciar sesión.')
      } else if (error.message.toLowerCase().includes('password')) {
        setFormError('La contraseña no cumple los requisitos de seguridad.')
      } else {
        setFormError(error.message)
      }
      return
    }
    // Signup OK — mostrar pantalla "revisá tu email"
    setView('sent')
  }

  // ── Forgot password ──────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })
    setLoading(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setView('reset-sent')
  }

  // Error del query param (callback failures, etc.)
  const errorMsg =
    errorParam === 'not_authorized'
      ? 'Tu cuenta no tiene acceso a esta app. Contactá al administrador.'
      : errorParam === 'auth'
      ? 'Hubo un error al iniciar sesión. Intentá de nuevo.'
      : null

  // Mensaje confirmando eliminación de cuenta (se llega acá tras eliminar
  // desde /configuracion → /api/me/delete cierra sesión → redirect a
  // /login?error=account_deleted). NO es un error real — es informativo.
  const deletedMsg = errorParam === 'account_deleted'
    ? 'Tu cuenta fue eliminada. Tenés 30 días para recuperarla iniciando sesión con el mismo email.'
    : null

  const inputClass = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 transition'

  return (
    <div className="min-h-screen flex">

      {/* Panel izquierdo — solo desktop */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
      >
        <div className="relative z-10 text-center px-12">
          <Image src="/logo.png" alt="Logo sinunmango" width={144} height={144} className="w-36 h-36 mx-auto mb-8 object-contain" priority />
          <h1 className="text-5xl font-bold mb-3">
            <span className="text-white">sinun</span><span style={{ color: '#f97316' }}>mango</span>
          </h1>
          <p className="text-lg text-white/70">Tu gestor financiero personal</p>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 sm:px-8 py-8">
        <div className="w-full max-w-sm space-y-6">

          <div className="lg:hidden text-center">
            <Image src="/logo.png" alt="Logo" width={64} height={64} className="w-16 h-16 mx-auto mb-4 object-contain" priority />
            <p className="text-2xl font-bold">
              <span className="text-slate-800">sinun</span><span style={{ color: '#f97316' }}>mango</span>
            </p>
          </div>

          {/* Error message del query param */}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          )}

          {/* Mensaje informativo post-deletion (no es error). */}
          {deletedMsg && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-700">{deletedMsg}</p>
            </div>
          )}

          {/* ── VISTA: confirmación post-signup ──────────────────────────── */}
          {view === 'sent' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Mail size={28} className="text-emerald-500" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800">Revisá tu email</h2>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                  Te mandamos un link de confirmación a <strong className="text-slate-700 break-all">{email}</strong>.
                  Abrilo desde el mismo dispositivo para activar tu cuenta y entrar.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  💡 ¿No lo ves? Revisá la carpeta de <strong>spam</strong> o esperá un par de minutos. El email
                  llega desde una dirección de Supabase con el asunto "Confirm your signup".
                </p>
              </div>
              <button
                onClick={() => { setView('choose'); setEmail(''); setPassword(''); setConfirm('') }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-slate-600 hover:bg-slate-50 border border-slate-200"
              >
                <ArrowLeft size={14} /> Volver al inicio
              </button>
            </div>
          )}

          {/* ── VISTA: confirmación post-forgot ──────────────────────────── */}
          {view === 'reset-sent' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle size={28} className="text-emerald-500" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800">Email enviado</h2>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                  Te mandamos un link a <strong className="text-slate-700 break-all">{email}</strong> para
                  restablecer tu contraseña. Hacé clic ahí y elegí una nueva.
                </p>
              </div>
              <button
                onClick={() => { setView('choose'); setFormError(null) }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-slate-600 hover:bg-slate-50 border border-slate-200"
              >
                <ArrowLeft size={14} /> Volver al inicio
              </button>
            </div>
          )}

          {/* ── VISTA: forgot password ───────────────────────────────────── */}
          {view === 'forgot' && (
            <>
              <div>
                <button
                  onClick={() => { setView('choose'); setFormError(null) }}
                  className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 mb-3"
                >
                  <ArrowLeft size={12} /> Volver
                </button>
                <div className="flex items-center gap-3 mb-1">
                  <KeyRound size={22} className="text-orange-500" />
                  <h2 className="text-2xl font-bold text-slate-800">Recuperar contraseña</h2>
                </div>
                <p className="text-slate-500 text-sm mt-1">Ingresá tu email y te mandamos un link para resetear la contraseña.</p>
              </div>

              {formError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
                >
                  {loading ? <Loader2 size={16} className="inline animate-spin" /> : 'Enviar link de recuperación'}
                </button>
              </form>
            </>
          )}

          {/* ── VISTA: signup ────────────────────────────────────────────── */}
          {view === 'signup' && (
            <>
              <div>
                <button
                  onClick={() => { setView('choose'); setFormError(null) }}
                  className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 mb-3"
                >
                  <ArrowLeft size={12} /> Volver
                </button>
                <h2 className="text-2xl font-bold text-slate-800">Crear cuenta</h2>
                <p className="text-slate-500 mt-1 text-sm">Te mandamos un email para confirmar.</p>
              </div>

              {formError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Repetí la contraseña</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Misma contraseña"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email || !password || !confirm}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
                >
                  {loading ? <Loader2 size={16} className="inline animate-spin" /> : 'Crear cuenta'}
                </button>
              </form>
            </>
          )}

          {/* ── VISTA: choose (default — login con Google + email/password) ─ */}
          {view === 'choose' && (
            <>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Bienvenido</h2>
                <p className="text-slate-500 mt-1 text-sm">Ingresá a sinunmango</p>
              </div>

              {/* Banner si vienen de un invite link — explica el contexto
                  ("estás registrándote para aceptar una invitación").
                  Aplica solo si nextParam apunta a /invite/[token]. */}
              {nextParam?.startsWith('/invite/') && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                  Estás respondiendo a una <strong>invitación a un workspace compartido</strong>. Ingresá con tu cuenta o creá una nueva — después te llevamos a aceptar la invitación.
                </div>
              )}

              {formError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-60"
              >
                <svg width="20" height="20" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
                </svg>
                Continuar con Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">o con email</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Email + Password */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Contraseña</label>
                    <button
                      type="button"
                      onClick={() => { setView('forgot'); setFormError(null); setPassword('') }}
                      className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    required
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
                >
                  {loading ? <Loader2 size={16} className="inline animate-spin" /> : 'Iniciar sesión'}
                </button>
              </form>

              {/* Signup link */}
              <p className="text-center text-sm text-slate-500">
                ¿No tenés cuenta?{' '}
                <button
                  onClick={() => { setView('signup'); setFormError(null); setPassword('') }}
                  className="font-semibold text-orange-500 hover:text-orange-600 hover:underline"
                >
                  Creá una
                </button>
              </p>

              <p className="text-center text-xs text-slate-300">
                Solo vos podés acceder a tus datos
              </p>
            </>
          )}

          {/* Link a privacidad — siempre visible */}
          {view !== 'sent' && view !== 'reset-sent' && (
            <p className="text-center text-[11px] text-slate-300 pt-2">
              Al continuar aceptás nuestra{' '}
              <Link href="/privacidad" className="underline hover:text-slate-500">política de privacidad</Link>.
            </p>
          )}
        </div>
      </div>

    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
