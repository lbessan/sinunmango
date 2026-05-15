import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg-main, #f1f5f9)' }}
    >
      <div
        className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center"
        style={{ backgroundColor: 'var(--bg-card, #ffffff)' }}
      >
        <p
          className="font-bold text-2xl mb-2"
          style={{
            background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          404
        </p>
        <p className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary, #1e293b)' }}>
          Esta página no existe
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary, #475569)' }}>
          La dirección que ingresaste no corresponde a ninguna pantalla de sinunmango.
        </p>

        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  )
}
