'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex">

      {/* Panel izquierdo — solo desktop */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent2, #0d3b6e) 0%, var(--accent, #1a6b5a) 100%)' }}
      >
        <img
          src="/fondo.png"
          alt="Fondo"
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="relative z-10 text-center px-12">
          <img
            src="/logo.png"
            alt="Logo sinunmango"
            className="w-36 h-36 mx-auto mb-8 object-contain"
          />
          <h1 className="text-5xl font-bold mb-3">
            <span className="text-white">sinun</span><span style={{ color: '#f97316' }}>mango</span>
          </h1>
          <p className="text-lg text-white/70">Tu gestor financiero personal</p>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-8">
        <div className="w-full max-w-sm space-y-8">

          <div className="lg:hidden text-center">
            <img src="/logo.png" alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
            <p className="text-2xl font-bold">
              <span className="text-slate-800">sinun</span><span style={{ color: '#f97316' }}>mango</span>
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-800">Bienvenido</h2>
            <p className="text-slate-500 mt-1 text-sm">Ingresá a sinunmango</p>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
            </svg>
            Continuar con Google
          </button>

          <p className="text-center text-xs text-slate-300">
            Solo vos podés acceder a tus datos
          </p>
        </div>
      </div>

    </div>
  )
}
