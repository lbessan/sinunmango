'use client'

// ─── Emitir Factura C (wsfe, directo a AFIP) ─────────────────────────────────
// Emite un documento fiscal REAL: pide confirmación antes de solicitar el CAE.
// Integra la libreta de clientes: elegís uno (autocompleta doc) o traés el
// nombre desde AFIP por CUIT. Al emitir, guarda/actualiza el cliente.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, AlertCircle, FileText, Search } from 'lucide-react'

type Pto = { nro: number; tipo: string | null; bloqueado: boolean }
type Cliente = { nombre: string; doc_tipo: number | null; doc_nro: string | null }
type Fase = 'form' | 'confirmar' | 'emitiendo' | 'ok'

const DOC_TIPOS = [
  { v: 99, label: 'Consumidor final' },
  { v: 80, label: 'CUIT' },
  { v: 96, label: 'DNI' },
  { v: 86, label: 'CUIL' },
]
const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)
const hoy = () => new Date().toISOString().slice(0, 10)

export function EmitirFacturaForm() {
  const router = useRouter()
  const [ptos, setPtos] = useState<Pto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ptoVta, setPtoVta] = useState<number | ''>('')
  const [concepto, setConcepto] = useState<1 | 2 | 3>(2)
  const [cliente, setCliente] = useState('')
  const [docTipo, setDocTipo] = useState(99)
  const [docNro, setDocNro] = useState('')
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [fase, setFase] = useState<Fase>('form')
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ cae: string; caeVto: string; numero: string } | null>(null)

  useEffect(() => {
    fetch('/api/monotributo/afip/emitir')
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return }
        const activos = (j.ptosVenta as Pto[]).filter(p => !p.bloqueado)
        setPtos(activos)
        if (activos.length === 1) setPtoVta(activos[0].nro)
      })
      .catch(() => setError('No se pudieron cargar los puntos de venta'))
    fetch('/api/monotributo/clientes').then(r => r.json()).then(j => setClientes(j.clientes ?? [])).catch(() => {})
  }, [])

  const importeNum = Number(importe)
  const valido = ptoVta !== '' && importeNum > 0 && (docTipo === 99 || Number(docNro) > 0)

  // Al tipear/elegir un nombre, si matchea un cliente guardado, autocompleta el doc.
  function onNombre(nombre: string) {
    setCliente(nombre)
    const c = clientes.find(x => x.nombre === nombre)
    if (c && c.doc_nro) { setDocTipo(c.doc_tipo ?? 80); setDocNro(c.doc_nro) }
  }

  // Trae el nombre del CUIT desde el padrón de AFIP.
  async function buscarNombre() {
    if (docNro.length !== 11) return
    setBuscando(true); setError('')
    try {
      const r = await fetch(`/api/monotributo/afip/consultar-cuit?cuit=${docNro}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se encontró')
      setCliente(j.nombre)
    } catch (e) { setError((e as Error).message) } finally { setBuscando(false) }
  }

  async function emitir() {
    setFase('emitiendo'); setError('')
    try {
      const r = await fetch('/api/monotributo/afip/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ptoVta, concepto, cliente, docTipo,
          docNro: docTipo === 99 ? 0 : Number(docNro),
          importe: importeNum,
          fecha: fecha.replace(/-/g, ''),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo emitir')
      setResult({ cae: j.cae, caeVto: j.caeVto, numero: j.numero }); setFase('ok'); router.refresh()
      // Guardar/actualizar el cliente (best-effort).
      if (cliente.trim() && docTipo !== 99) {
        fetch('/api/monotributo/clientes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: cliente, doc_tipo: docTipo, doc_nro: docNro }),
        }).catch(() => {})
      }
    } catch (e) { setError((e as Error).message); setFase('form') }
  }

  if (fase === 'ok' && result) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Check className="text-emerald-600" size={20} /></div>
          <div>
            <p className="font-semibold text-slate-800">Factura C {result.numero} emitida</p>
            <p className="text-sm text-slate-500">CAE <b>{result.cae}</b> · vence {result.caeVto}</p>
          </div>
        </div>
        <button onClick={() => { setFase('form'); setResult(null); setImporte(''); setCliente(''); setDocNro('') }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Emitir otra</button>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}
      {ptos.length === 0 && !error && <p className="text-sm text-slate-500">Cargando puntos de venta…</p>}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Punto de venta</span>
          <select value={ptoVta} onChange={e => setPtoVta(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Elegí…</option>
            {ptos.map(p => <option key={p.nro} value={p.nro}>{String(p.nro).padStart(5, '0')}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Concepto</span>
          <select value={concepto} onChange={e => setConcepto(Number(e.target.value) as 1 | 2 | 3)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value={2}>Servicios</option>
            <option value={1}>Productos</option>
            <option value={3}>Productos y servicios</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Tipo doc. del cliente</span>
          <select value={docTipo} onChange={e => setDocTipo(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {DOC_TIPOS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </label>
        {docTipo !== 99 && (
          <label className="text-sm">
            <span className="block font-medium text-slate-700 mb-1">{docTipo === 80 ? 'CUIT' : docTipo === 96 ? 'DNI' : 'Nº documento'}</span>
            <div className="flex gap-1.5">
              <input value={docNro} onChange={e => setDocNro(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
                className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              {docTipo === 80 && (
                <button type="button" onClick={buscarNombre} disabled={buscando || docNro.length !== 11} title="Traer nombre desde AFIP"
                  className="px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 shrink-0">
                  {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              )}
            </div>
          </label>
        )}
      </div>

      <label className="text-sm block">
        <span className="block font-medium text-slate-700 mb-1">Cliente <span className="font-normal text-slate-400">(nombre, para tu resumen)</span></span>
        <input value={cliente} onChange={e => onNombre(e.target.value)} placeholder="Elegí uno guardado o escribí" list="clientes-dl"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <datalist id="clientes-dl">{clientes.map(c => <option key={c.nombre} value={c.nombre} />)}</datalist>
        <span className="block text-[11px] text-slate-400 mt-1">
          AFIP identifica al cliente por su {docTipo === 99 ? 'documento' : 'CUIT/DNI'}; el nombre es para tu resumen. Tip: poné el CUIT y tocá 🔍 para traer el nombre.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Importe</span>
          <input value={importe} onChange={e => setImporte(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0.00"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Fecha</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>

      {fase === 'confirmar' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-900">
            Vas a emitir una <b>Factura C real</b> por <b>{money(importeNum)}</b> (punto {String(ptoVta).padStart(5, '0')}). Se le pide el CAE a AFIP.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setFase('form')} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Cancelar</button>
            <button onClick={emitir} className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
              <FileText size={15} /> Confirmar y emitir
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setFase('confirmar')} disabled={!valido || fase === 'emitiendo'}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
          {fase === 'emitiendo' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Emitir factura
        </button>
      )}
    </div>
  )
}
