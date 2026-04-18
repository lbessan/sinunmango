export default function PendientePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto">
          <span className="text-3xl">⏳</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Acceso pendiente</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Tu cuenta está registrada pero todavía no fue autorizada.
            Cuando el administrador apruebe tu acceso vas a poder entrar.
          </p>
        </div>
        <a
          href="/login"
          className="inline-block text-sm text-slate-400 hover:text-slate-600 underline"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  )
}
