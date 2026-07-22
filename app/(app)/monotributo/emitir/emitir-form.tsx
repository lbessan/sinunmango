'use client'

// ─── Emitir Factura C (wsfe, directo a AFIP) ─────────────────────────────────
// Cliente elegido POR NOMBRE (de la libreta) → autocompleta CUIT y condición
// IVA. Varios ítems (descripción, cantidad, precio) → total. Emite un documento
// fiscal REAL: confirma antes de pedir el CAE.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, AlertCircle, FileText, Search, Plus, X, Download } from 'lucide-react'

type Pto = { nro: number; bloqueado: boolean }
type Cliente = { id: string; nombre: string; doc_tipo: number | null; doc_nro: string | null; condicion_iva: number | null }
type Item = { descripcion: string; cantidad: string; precio: string }
type Fase = 'form' | 'confirmar' | 'emitiendo' | 'ok'

const COND_IVA = [
  { v: 1, label: 'Responsable Inscripto' },
  { v: 6, label: 'Responsable Monotributo' },
  { v: 4, label: 'IVA Sujeto Exento' },
  { v: 5, label: 'Consumidor Final' },
]
const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)
const hoy = () => new Date().toISOString().slice(0, 10)
const ymd = (d: string) => d.replace(/-/g, '')

export function EmitirFacturaForm() {
  const router = useRouter()
  const [ptos, setPtos] = useState<Pto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ptoVta, setPtoVta] = useState<number | ''>('')
  const [fecha, setFecha] = useState(hoy())
  const [concepto, setConcepto] = useState<1 | 2 | 3>(2)

  const [clienteSel, setClienteSel] = useState('') // id | '' | 'nuevo'
  const [nombre, setNombre] = useState('')
  const [docTipo, setDocTipo] = useState(80)
  const [docNro, setDocNro] = useState('')
  const [condIva, setCondIva] = useState(1)
  const [buscando, setBuscando] = useState(false)

  const [items, setItems] = useState<Item[]>([{ descripcion: '', cantidad: '1', precio: '' }])
  const [periodoDesde, setPeriodoDesde] = useState(hoy())
  const [periodoHasta, setPeriodoHasta] = useState(hoy())
  const [vtoPago, setVtoPago] = useState(hoy())

  const [fase, setFase] = useState<Fase>('form')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ cae: string; caeVto: string; numero: string; id: string | null } | null>(null)

  useEffect(() => {
    fetch('/api/monotributo/afip/emitir').then(r => r.json()).then(j => {
      if (j.error) { setError(j.error); return }
      const activos = (j.ptosVenta as Pto[]).filter(p => !p.bloqueado)
      setPtos(activos)
      if (activos.length === 1) setPtoVta(activos[0].nro)
    }).catch(() => setError('No se pudieron cargar los puntos de venta'))
    fetch('/api/monotributo/clientes').then(r => r.json()).then(j => setClientes(j.clientes ?? [])).catch(() => {})
  }, [])

  const total = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio) || 0), 0)
  const clienteOk = docTipo === 99 || docNro.replace(/\D/g, '').length >= 7
  const valido = ptoVta !== '' && total > 0 && clienteOk && nombre.trim()

  function elegirCliente(id: string) {
    setClienteSel(id)
    if (id === 'nuevo' || id === '') { setNombre(''); setDocNro(''); return }
    const c = clientes.find(x => x.id === id)
    if (c) {
      setNombre(c.nombre)
      setDocTipo(c.doc_tipo ?? 80)
      setDocNro(c.doc_nro ?? '')
      setCondIva(c.condicion_iva ?? 1)
    }
  }

  async function buscarNombre() {
    const cuit = docNro.replace(/\D/g, '')
    if (cuit.length !== 11) return
    setBuscando(true); setError('')
    try {
      const j = await fetch(`/api/monotributo/afip/consultar-cuit?cuit=${cuit}`).then(r => r.json())
      if (j.error) throw new Error(j.error)
      setNombre(j.nombre)
    } catch (e) { setError((e as Error).message) } finally { setBuscando(false) }
  }

  const setItem = (i: number, patch: Partial<Item>) => setItems(its => its.map((it, j) => j === i ? { ...it, ...patch } : it))
  const addItem = () => setItems(its => [...its, { descripcion: '', cantidad: '1', precio: '' }])
  const delItem = (i: number) => setItems(its => its.length > 1 ? its.filter((_, j) => j !== i) : its)

  async function emitir() {
    setFase('emitiendo'); setError('')
    try {
      const body = {
        ptoVta, concepto, cliente: nombre,
        docTipo, docNro: docTipo === 99 ? 0 : Number(docNro.replace(/\D/g, '')),
        condicionIvaReceptor: docTipo === 99 ? 5 : condIva,
        items: items.filter(it => Number(it.precio) > 0).map(it => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad) || 1, precio: Number(it.precio) })),
        fecha: ymd(fecha),
        ...(concepto !== 1 ? { fchServDesde: ymd(periodoDesde), fchServHasta: ymd(periodoHasta), fchVtoPago: ymd(vtoPago) } : {}),
      }
      const r = await fetch('/api/monotributo/afip/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo emitir')
      setResult({ cae: j.cae, caeVto: j.caeVto, numero: j.numero, id: j.id }); setFase('ok'); router.refresh()
      // Guardar/actualizar el cliente (best-effort).
      if (nombre.trim() && docTipo !== 99) {
        fetch('/api/monotributo/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, doc_tipo: docTipo, doc_nro: docNro, condicion_iva: condIva }) }).catch(() => {})
      }
    } catch (e) { setError((e as Error).message); setFase('form') }
  }

  // ── Resultado ──
  if (fase === 'ok' && result) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Check className="text-emerald-600" size={20} /></div>
          <div>
            <p className="font-semibold text-slate-800">Factura C {result.numero} emitida</p>
            <p className="text-sm text-slate-500">CAE <b>{result.cae}</b> · vence {result.caeVto}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.id && (
            <a href={`/api/monotributo/afip/factura-pdf?id=${result.id}`} target="_blank" rel="noopener"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
              <Download size={15} /> Descargar PDF
            </a>
          )}
          <button onClick={() => { setFase('form'); setResult(null); setItems([{ descripcion: '', cantidad: '1', precio: '' }]); setClienteSel(''); setNombre(''); setDocNro('') }}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Emitir otra</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* Punto de venta + fecha + concepto */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Punto de venta">
          <select value={ptoVta} onChange={e => setPtoVta(Number(e.target.value))} className="input">
            <option value="">…</option>
            {ptos.map(p => <option key={p.nro} value={p.nro}>{String(p.nro).padStart(5, '0')}</option>)}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" />
        </Field>
        <Field label="Concepto">
          <select value={concepto} onChange={e => setConcepto(Number(e.target.value) as 1 | 2 | 3)} className="input">
            <option value={2}>Servicios</option><option value={1}>Productos</option><option value={3}>Ambos</option>
          </select>
        </Field>
      </div>

      {/* Cliente */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <Field label="Cliente">
          <select value={clienteSel} onChange={e => elegirCliente(e.target.value)} className="input">
            <option value="">Elegí de tu libreta…</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.doc_nro ? ` — ${c.doc_nro}` : ' (sin CUIT)'}</option>)}
            <option value="nuevo">➕ Nuevo cliente</option>
          </select>
        </Field>

        {clienteSel === 'nuevo' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUIT">
              <div className="flex gap-1.5">
                <input value={docNro} onChange={e => setDocNro(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="CUIT" className="input flex-1 min-w-0" />
                <button type="button" onClick={buscarNombre} disabled={buscando || docNro.replace(/\D/g, '').length !== 11} title="Traer nombre de AFIP"
                  className="px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 shrink-0">
                  {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              </div>
            </Field>
            <Field label="Nombre / razón social">
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" className="input" />
            </Field>
          </div>
        )}

        {(clienteSel && clienteSel !== '') && docTipo !== 99 && (
          <Field label="Condición frente al IVA">
            <select value={condIva} onChange={e => setCondIva(Number(e.target.value))} className="input">
              {COND_IVA.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
          </Field>
        )}
      </div>

      {/* Ítems */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Ítems</p>
          <button onClick={addItem} className="text-xs inline-flex items-center gap-1 text-[color:var(--accent)] hover:underline"><Plus size={13} /> Agregar ítem</button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={i === 0 ? 'Descripción' : ''} className="flex-1 min-w-0">
              <input value={it.descripcion} onChange={e => setItem(i, { descripcion: e.target.value })} placeholder="Detalle" className="input" />
            </Field>
            <Field label={i === 0 ? 'Cant.' : ''} className="w-16">
              <input value={it.cantidad} onChange={e => setItem(i, { cantidad: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className="input text-center" />
            </Field>
            <Field label={i === 0 ? 'Precio unit.' : ''} className="w-32">
              <input value={it.precio} onChange={e => setItem(i, { precio: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="0.00" className="input text-right" />
            </Field>
            <button onClick={() => delItem(i)} disabled={items.length === 1} className="mb-2 p-1.5 text-slate-300 hover:text-red-400 disabled:opacity-30"><X size={15} /></button>
          </div>
        ))}
        <div className="flex justify-end pt-1 border-t border-slate-100">
          <p className="text-sm text-slate-600">Total: <b className="text-slate-900 text-base">{money(total)}</b></p>
        </div>
      </div>

      {/* Período (servicios) */}
      {concepto !== 1 && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Período desde"><input type="date" value={periodoDesde} onChange={e => setPeriodoDesde(e.target.value)} className="input" /></Field>
          <Field label="Período hasta"><input type="date" value={periodoHasta} onChange={e => setPeriodoHasta(e.target.value)} className="input" /></Field>
          <Field label="Vto. de pago"><input type="date" value={vtoPago} onChange={e => setVtoPago(e.target.value)} className="input" /></Field>
        </div>
      )}

      {/* Confirmar / emitir */}
      {fase === 'confirmar' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-900">Vas a emitir una <b>Factura C real</b> a <b>{nombre || 'Consumidor final'}</b> por <b>{money(total)}</b>. Se le pide el CAE a AFIP.</p>
          <div className="flex gap-2">
            <button onClick={() => setFase('form')} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">Cancelar</button>
            <button onClick={emitir} className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}><FileText size={15} /> Confirmar y emitir</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setFase('confirmar')} disabled={!valido || fase === 'emitiendo'}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-2" style={{ background: 'var(--accent)' }}>
          {fase === 'emitiendo' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Emitir factura
        </button>
      )}

      <style jsx>{`.input{width:100%;border:1px solid rgb(226 232 240);border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--accent)}`}</style>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`text-sm block ${className}`}>
      {label && <span className="block font-medium text-slate-700 mb-1 text-xs">{label}</span>}
      {children}
    </label>
  )
}
