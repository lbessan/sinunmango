'use client'

// ─── Importar el CSV de "Mis Comprobantes" (ARCA) ────────────────────────────
//
// Es el camino para traer TODO lo facturado de una, sin cargar factura por
// factura y sin entregarle la clave fiscal a nadie: ARCA deja bajar el CSV de
// comprobantes emitidos, y acá lo leemos entero.
//
// Flujo: elegís el archivo → preview (qué leímos, cuántas son nuevas) →
// confirmás → se guardan. Reimportar el mismo archivo no duplica nada.

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, Loader2, X, Check, AlertTriangle, ExternalLink } from 'lucide-react'

const MIS_COMPROBANTES_URL = 'https://www.arca.gob.ar/'

type PreviewRow = {
  fecha: string; cliente: string; monto: number
  numero: string; tipo: string; esNotaCredito: boolean
}
type Resumen = {
  encontradas: number; nuevas: number; yaEstaban: number
  notasCredito: number; totalNuevas: number
  desde: string; hasta: string; descartadas: number
}

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function ImportarComprobantesButton() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [open, setOpen]       = useState(false)
  const [csv, setCsv]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [importadas, setImportadas] = useState<number | null>(null)

  const reset = () => {
    setOpen(false); setCsv(''); setError(''); setResumen(null)
    setPreview([]); setImportadas(null); setLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function analizar(file: File) {
    setError(''); setLoading(true); setOpen(true); setImportadas(null)
    try {
      const texto = await file.text()
      setCsv(texto)
      const r = await fetch('/api/monotributo/importar-comprobantes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: texto, dryRun: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No pudimos leer el archivo')
      setResumen(j.resumen); setPreview(j.preview ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }

  async function confirmar() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/monotributo/importar-comprobantes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudieron guardar')
      setImportadas(j.importadas)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <input
        ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) analizar(f) }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        title="Importar el CSV de Mis Comprobantes de ARCA"
        className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
      >
        <FileSpreadsheet size={14} />Importar de ARCA
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={!loading ? reset : undefined}>
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>

            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                <h2 className="text-base font-semibold text-slate-800">
                  {importadas !== null ? `${importadas} facturas importadas` : 'Importar de Mis Comprobantes'}
                </h2>
              </div>
              {!loading && <button onClick={reset} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loading && (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />Leyendo el archivo…
                </p>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}

              {importadas !== null && (
                <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                  <Check size={16} className="shrink-0 mt-0.5" />
                  <span>Listo. Se guardaron {importadas} {importadas === 1 ? 'factura' : 'facturas'}. Ya están en el gauge y en la proyección.</span>
                </div>
              )}

              {resumen && importadas === null && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Card label="En el archivo" valor={String(resumen.encontradas)} />
                    <Card label="Nuevas" valor={String(resumen.nuevas)} destacado />
                    <Card label="Ya estaban" valor={String(resumen.yaEstaban)} />
                  </div>
                  <p className="text-xs text-slate-500">
                    Período {fmtFecha(resumen.desde)} a {fmtFecha(resumen.hasta)} · suman{' '}
                    <b className="text-slate-700">${fmt(resumen.totalNuevas)}</b>
                    {resumen.notasCredito > 0 && <> · {resumen.notasCredito} nota{resumen.notasCredito === 1 ? '' : 's'} de crédito (restan)</>}
                  </p>

                  {resumen.nuevas > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <p className="text-xs font-medium text-slate-500 px-3 py-2 bg-slate-50 border-b border-slate-100">
                        Primeras {Math.min(preview.length, resumen.nuevas)} de {resumen.nuevas}
                      </p>
                      <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                        {preview.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2">
                            <span className="text-xs text-slate-400 w-14 shrink-0 tabular-nums">{fmtFecha(f.fecha)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-800 truncate">{f.cliente}</p>
                              <p className="text-[11px] text-slate-400 truncate">{f.numero} · {f.tipo}</p>
                            </div>
                            <span className={`text-sm font-semibold tabular-nums shrink-0 ${f.esNotaCredito ? 'text-red-600' : 'text-slate-800'}`}>
                              ${fmt(f.monto)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {resumen.nuevas === 0 && (
                    <p className="text-sm text-slate-500">Todas las facturas del archivo ya estaban cargadas. No hay nada para importar.</p>
                  )}
                </>
              )}

              {!resumen && !loading && !error && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p className="font-medium text-slate-700">Cómo bajar el archivo:</p>
                  <ol className="list-decimal pl-5 space-y-1 text-slate-500">
                    <li>Entrá a ARCA con tu clave fiscal → <b>Mis Comprobantes</b> → <b>Emitidos</b>.</li>
                    <li>Elegí el rango de fechas y tocá <b>Descargar CSV</b>.</li>
                    <li>Subí ese archivo acá.</li>
                  </ol>
                  <a href={MIS_COMPROBANTES_URL} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline">
                    <ExternalLink size={12} />Abrir ARCA
                  </a>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              {importadas === null && resumen && resumen.nuevas > 0 ? (
                <>
                  <button onClick={reset} disabled={loading} className="text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
                  <button onClick={confirmar} disabled={loading}
                    className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50"
                    style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Importar {resumen.nuevas}
                  </button>
                </>
              ) : (
                <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-700">Cerrar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Card({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-bold tabular-nums ${destacado ? 'text-emerald-700 text-xl' : 'text-slate-800 text-lg'}`}>{valor}</p>
    </div>
  )
}
