'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, CheckCircle, KeyRound } from 'lucide-react'

function UpdatePasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Supabase puede mandar error en los query params si el link expiró
  const urlError = searchParams.get('error')
  const urlErrorDesc = searchParams.get('error_description')

  useEffect(() => {
    if (urlError) {
      setError(
        urlError === 'access_denied' && urlErrorDesc?.includes('expired')
          ? 'El link de recuperación expiró. Pedí uno nuevo desde la pantalla de inicio.'
          : urlErrorDesc?.replace(/\+/g, ' ') ?? 'El link no es válido.'
      )
    }
  }, [urlError, urlErrorDesc])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 3000)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* Panel izquierdo — solo desktop */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
      >
        <div className="relative z-10 text-center px-12">
          <img src="/logo.png" alt="Logo sinunmango" className="w-36 h-36 mx-auto mb-8 object-contain" />
          <h1 className="text-5xl font-bold mb-3">
            <span className="text-white">sinun</span><span style={{ color: '#f97316' }}>mango</span>
          </h1>
          <p className="text-lg text-white/70">Tu gestor financiero personal</p>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-8">
        <div className="w-full max-w-sm space-y-6">

          <div className="lg:hidden text-center">
            <img src="/logo.png" alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
            <p className="text-2xl font-bold">
              <span className="text-slate-800">sinun</span><span style={{ color: '#f97316' }}>mango</span>
            </p>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle size={48} className="text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">¡Contraseña actualizada!</h2>
              <p className="text-slate-500 text-sm">Serás redirigido al dashboard en unos segundos...</p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <KeyRound size={22} className="text-orange-500" />
                  <h2 className="text-2xl font-bold text-slate-800">Nueva contraseña</h2>
                </div>
                <p className="text-slate-500 text-sm">Elegí una contraseña segura para tu cuenta.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!urlError && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Nueva contraseña</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Confirmar contraseña</label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repetí la contraseña"
                      required
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
                  >
                    {loading ? 'Guardando...' : 'Guardar contraseña'}
                  </button>
                </form>
              )}

              {urlError && (
                <a
                  href="/login"
                  className="block w-full text-center py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
                >
                  Volver al inicio
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense>
      <UpdatePasswordContent />
    </Suspense>
  )
}
