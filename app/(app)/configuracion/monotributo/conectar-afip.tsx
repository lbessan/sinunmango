'use client'

// ─── Wizard "Conectar con AFIP" ──────────────────────────────────────────────
//
// Guía al usuario para generar su certificado digital en AFIP y conectarlo.
// Flujo (Modelo A — certificado propio, sin compartir la clave fiscal):
//   1. Ponés tu CUIT → generamos tu par de claves + CSR (la clave privada queda
//      encriptada en el server, nunca sale).
//   2. Copiás/descargás el CSR y seguís el paso a paso en AFIP: creás el
//      certificado, lo descargás y lo asociás a los servicios.
//   3. Pegás acá el certificado que te dio AFIP → queda conectado.
//
// (La lectura automática de categoría + facturación con ese certificado es el
//  siguiente paso — Fase 2.)

import { useState } from 'react'
import { Copy, Download, Check, ExternalLink, ShieldCheck, Loader2 } from 'lucide-react'

const GUIA_AFIP = 'https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/obtener-certificado-de-produccion'
const WSASS_MANUAL = 'https://www.afip.gob.ar/ws/WSASS/WSASS_manual.pdf'

export function ConectorAfip() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1)
  const [cuit, setCuit] = useState('')
  const [csr, setCsr] = useState('')
  const [cert, setCert] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generarCsr() {
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/monotributo/afip/generar-csr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuit }),
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certPem: cert }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar el certificado')
      setPaso(4)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  const copiarCsr = () => {
    navigator.clipboard.writeText(csr).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })
  }
  const descargarCsr = () => {
    const blob = new Blob([csr], { type: 'application/x-pem-file' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'sinunmango.csr'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="max-w-2xl">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 text-xs font-medium">
        {['Tu CUIT', 'En AFIP', 'Pegá el certificado', 'Listo'].map((t, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4
          const done = paso > n, active = paso === n
          return (
            <div key={t} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px]
                ${done ? 'text-white' : active ? 'text-white' : 'bg-slate-100 text-slate-400'}`}
                style={done || active ? { background: 'var(--accent, #1a6b5a)' } : {}}>
                {done ? <Check size={13} /> : n}
              </span>
              <span className={active ? 'text-slate-800' : 'text-slate-400'}>{t}</span>
              {n < 4 && <span className="w-4 h-px bg-slate-200" />}
            </div>
          )
        })}
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      {/* Paso 1 — CUIT */}
      {paso === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-slate-600">
              Vas a generar tu <b>certificado digital</b> en AFIP para que sinunmango lea tu categoría y
              facturación solo. <b>Nunca te pedimos tu clave fiscal</b> — el certificado es la llave, y se
              guarda encriptado.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tu CUIT</label>
            <input
              value={cuit} onChange={e => setCuit(e.target.value)} inputMode="numeric"
              placeholder="20-12345678-9"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
            />
          </div>
          <button
            onClick={generarCsr} disabled={loading || cuit.replace(/\D/g, '').length !== 11}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2"
            style={{ background: 'var(--accent)' }}>
            {loading && <Loader2 size={15} className="animate-spin" />} Generar solicitud
          </button>
        </div>
      )}

      {/* Paso 2 — CSR + instrucciones AFIP */}
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
              <li>Entrá a AFIP con tu <b>clave fiscal</b> y abrí <b>“Administrador de Relaciones de Clave Fiscal”</b>. Si no tenés el servicio de certificados, adherilo (<b>WSASS – Certificados Digitales</b>).</li>
              <li>Creá un <b>certificado nuevo</b>: pegá el CSR de arriba y <b>descargá el certificado</b> (.crt/.pem) que te devuelve AFIP.</li>
              <li>Asociá ese certificado a los servicios <b>“Constancia de Inscripción”</b> y <b>“Facturación Electrónica (wsfe)”</b> (Administrador de Relaciones → <b>Nueva Relación</b>).</li>
            </ol>
            <div className="flex flex-wrap gap-3 mt-3 text-xs">
              <a href={GUIA_AFIP} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[color:var(--accent)] hover:underline"><ExternalLink size={12} /> Guía con capturas</a>
              <a href={WSASS_MANUAL} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-slate-500 hover:underline"><ExternalLink size={12} /> Manual WSASS (AFIP)</a>
            </div>
          </div>

          <button onClick={() => setPaso(3)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
            Ya tengo el certificado →
          </button>
        </div>
      )}

      {/* Paso 3 — pegar certificado */}
      {paso === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Pegá el <b>certificado</b> que te dio AFIP (empieza con <code className="text-xs bg-slate-100 px-1 rounded">-----BEGIN CERTIFICATE-----</code>):</p>
          <textarea
            value={cert} onChange={e => setCert(e.target.value)} rows={6}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
          />
          <div className="flex gap-2">
            <button onClick={() => setPaso(2)} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Volver</button>
            <button onClick={guardarCert} disabled={loading || !cert.includes('CERTIFICATE')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2"
              style={{ background: 'var(--accent)' }}>
              {loading && <Loader2 size={15} className="animate-spin" />} Conectar
            </button>
          </div>
        </div>
      )}

      {/* Paso 4 — listo */}
      {paso === 4 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Check className="text-emerald-600" size={24} />
          </div>
          <p className="font-semibold text-slate-800">¡AFIP conectado!</p>
          <p className="text-sm text-slate-500 mt-1">Ya podemos leer tu categoría y facturación solos, sin cargar nada a mano.</p>
        </div>
      )}
    </div>
  )
}
