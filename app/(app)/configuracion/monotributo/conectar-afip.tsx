'use client'

// ─── Conectar con AFIP (certificado propio, directo — sin terceros) ──────────
//
// Dos modos según si ya hay un certificado conectado:
//   • Sin cert  → wizard: CUIT → generamos CSR (la clave privada queda cifrada
//     en el server) → lo subís a AFIP y pegás el certificado.
//   • Con cert  → panel de estado: "Sincronizar ahora" (WSAA + Constancia →
//     categoría) y muestra lo último traído.
//
// La sincronización le pega DIRECTO a AFIP con tu certificado (sin clave fiscal,
// sin servicios de terceros).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Download, Check, ExternalLink, ShieldCheck, Loader2, RefreshCw, AlertCircle } from 'lucide-react'

const WSASS_MANUAL = 'https://www.afip.gob.ar/ws/WSASS/WSASS_manual.pdf'

type Datos = {
  categoria: string | null
  descripcionCategoria: string | null
  periodo: string | null
  actividad: string | null
  activo: boolean
}
type Paso = 'estado' | 1 | 2 | 3 | 'sincronizando'

export function ConectorAfip({
  yaConectado,
  cuitInicial,
  ultimaSync,
  datosIniciales,
  syncError,
}: {
  yaConectado: boolean
  cuitInicial: string
  ultimaSync: string | null
  datosIniciales: Datos | null
  syncError: string | null
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<Paso>(yaConectado ? 'estado' : 1)
  const [cuit, setCuit] = useState(cuitInicial)
  const [csr, setCsr] = useState('')
  const [cert, setCert] = useState('')
  const [datos, setDatos] = useState<Datos | null>(datosIniciales)
  const [copiado, setCopiado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generarCsr() {
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/monotributo/afip/generar-csr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuit }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo generar la solicitud')
      setCsr(j.csr); setPaso(2)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  async function guardarCert() {
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/monotributo/afip/guardar-certificado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ certPem: cert }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar el certificado')
      await sincronizar() // recién conectado → traemos la categoría de una
    } catch (e) { setError((e as Error).message); setLoading(false) }
  }

  async function sincronizar() {
    setError(''); setPaso('sincronizando'); setLoading(true)
    try {
      const r = await fetch('/api/monotributo/afip/sincronizar', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) {
        throw new Error(j.noAutorizado
          ? 'Tu certificado no tiene habilitado el servicio de Constancia de Inscripción. Asocialo en AFIP (Administrador de Relaciones → Nueva Relación → Constancia de Inscripción) y reintentá.'
          : (j.error || 'No se pudo sincronizar'))
      }
      setDatos(j.datos); setPaso('estado'); router.refresh()
    } catch (e) { setError((e as Error).message); setPaso('estado') } finally { setLoading(false) }
  }

  const copiarCsr = () => navigator.clipboard.writeText(csr).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })
  const descargarCsr = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csr], { type: 'application/x-pem-file' }))
    a.download = 'sinunmango.csr'; a.click(); URL.revokeObjectURL(a.href)
  }

  // ── Panel de estado (cert conectado) ───────────────────────────────────────
  if (paso === 'estado') {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-slate-800">Certificado conectado</p>
            <p className="text-sm text-slate-500">Leemos tu categoría directo de AFIP con tu certificado — sin clave fiscal ni servicios de terceros.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {datos?.categoria ? (
          <div className="grid grid-cols-2 gap-3">
            <Dato label="Categoría" valor={`Categoría ${datos.categoria}`} destacado />
            <Dato label="Estado" valor={datos.activo ? 'Activo' : '—'} />
            {datos.descripcionCategoria && <Dato label="Régimen" valor={datos.descripcionCategoria} />}
            {datos.periodo && <Dato label="Período" valor={datos.periodo} />}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Todavía no sincronizamos tu categoría. Dale a “Sincronizar ahora”.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={sincronizar} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Sincronizar ahora
          </button>
          <button onClick={() => { setPaso(1); setError('') }} className="text-sm text-slate-500 hover:text-slate-700">Usar otro certificado</button>
        </div>

        {ultimaSync && <p className="text-xs text-slate-400">Última sincronización: {new Date(ultimaSync).toLocaleString('es-AR')}</p>}
        {syncError && !error && <p className="text-xs text-amber-600">Último error: {syncError}</p>}
      </div>
    )
  }

  // ── Sincronizando ──────────────────────────────────────────────────────────
  if (paso === 'sincronizando') {
    return (
      <div className="max-w-2xl bg-slate-50 border border-slate-100 rounded-xl p-8 text-center">
        <Loader2 className="animate-spin mx-auto text-slate-400 mb-3" size={28} />
        <p className="font-medium text-slate-700">Consultando AFIP con tu certificado…</p>
        <p className="text-sm text-slate-500 mt-1">Login WSAA + Constancia de Inscripción. Un segundo.</p>
      </div>
    )
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6 text-xs font-medium">
        {['Tu CUIT', 'En AFIP', 'Pegá el certificado'].map((t, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const done = typeof paso === 'number' && paso > n, active = paso === n
          return (
            <div key={t} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${done || active ? 'text-white' : 'bg-slate-100 text-slate-400'}`}
                style={done || active ? { background: 'var(--accent, #1a6b5a)' } : {}}>{done ? <Check size={13} /> : n}</span>
              <span className={active ? 'text-slate-800' : 'text-slate-400'}>{t}</span>
              {n < 3 && <span className="w-4 h-px bg-slate-200" />}
            </div>
          )
        })}
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      {paso === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-slate-600">
              Vas a generar tu <b>certificado digital</b> en AFIP para que leamos tu categoría directo, sin
              clave fiscal ni terceros. La clave privada se genera acá y queda <b>encriptada</b> — nunca sale.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tu CUIT</label>
            <input value={cuit} onChange={e => setCuit(e.target.value)} inputMode="numeric" placeholder="20-12345678-9"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: 'var(--accent)' }} />
          </div>
          <button onClick={generarCsr} disabled={loading || cuit.replace(/\D/g, '').length !== 11}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
            {loading && <Loader2 size={15} className="animate-spin" />} Generar solicitud
          </button>
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Tu solicitud (CSR). Copiala o descargala — la vas a pegar en AFIP:</p>
          <div className="relative">
            <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-32">{csr}</pre>
            <div className="flex gap-2 mt-2">
              <button onClick={copiarCsr} className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
              <button onClick={descargarCsr} className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                <Download size={13} /> Descargar .csr
              </button>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">En AFIP (una sola vez):</p>
            <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-5">
              <li>Entrá con tu <b>clave fiscal</b> y abrí <b>“Administrador de Certificados Digitales (WSASS)”</b>. Creá un <b>certificado nuevo</b>: pegá el CSR de arriba y <b>descargá el certificado</b> (.crt).</li>
              <li>En <b>“Administrador de Relaciones”</b> → <b>Nueva Relación</b>, asociá el certificado al servicio <b>“Constancia de Inscripción”</b> (para leer la categoría). Muchos certificados ya lo traen.</li>
            </ol>
            <div className="flex flex-wrap gap-3 mt-3 text-xs">
              <a href={WSASS_MANUAL} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-slate-500 hover:underline"><ExternalLink size={12} /> Manual WSASS (AFIP)</a>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPaso(1)} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Volver</button>
            <button onClick={() => setPaso(3)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Ya tengo el certificado →</button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Pegá el <b>certificado</b> que te dio AFIP (empieza con <code className="text-xs bg-slate-100 px-1 rounded">-----BEGIN CERTIFICATE-----</code>):</p>
          <textarea value={cert} onChange={e => setCert(e.target.value)} rows={6}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: 'var(--accent)' }} />
          <div className="flex gap-2">
            <button onClick={() => setPaso(2)} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Volver</button>
            <button onClick={guardarCert} disabled={loading || !cert.includes('CERTIFICATE')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
              {loading && <Loader2 size={15} className="animate-spin" />} Conectar y sincronizar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Dato({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-semibold ${destacado ? 'text-emerald-700 text-lg' : 'text-slate-800'}`}>{valor}</p>
    </div>
  )
}
