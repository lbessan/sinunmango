'use client'

// Libreta de clientes: importar desde facturas, agregar por CUIT (con nombre
// autocompletado del padrón) o a mano, y ver/editar la lista.

import { useState } from 'react'
import { Loader2, Search, Plus, CloudDownload, User, FileUp } from 'lucide-react'

type Cliente = { id: string; nombre: string; doc_tipo: number | null; doc_nro: string | null }

const docLabel = (t: number | null) => (t === 80 ? 'CUIT' : t === 96 ? 'DNI' : t === 86 ? 'CUIL' : 'Doc')

export function ClientesManager({ iniciales, afipConectado }: { iniciales: Cliente[]; afipConectado: boolean }) {
  const [clientes, setClientes] = useState<Cliente[]>(iniciales)
  const [nombre, setNombre] = useState('')
  const [cuit, setCuit] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editCuit, setEditCuit] = useState('')

  async function reload() {
    const j = await fetch('/api/monotributo/clientes').then(r => r.json())
    setClientes(j.clientes ?? [])
  }

  // Completa el CUIT de un cliente ya existente (upsert por nombre lo actualiza).
  async function guardarCuit(c: Cliente) {
    const cuitLimpio = editCuit.replace(/\D/g, '')
    if (cuitLimpio.length !== 11) return
    await fetch('/api/monotributo/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: c.nombre, doc_tipo: 80, doc_nro: cuitLimpio }),
    })
    setEditandoId(null); setEditCuit(''); await reload()
  }

  async function buscar() {
    if (cuit.replace(/\D/g, '').length !== 11) return
    setBuscando(true); setError('')
    try {
      const j = await fetch(`/api/monotributo/afip/consultar-cuit?cuit=${cuit.replace(/\D/g, '')}`).then(r => r.json())
      if (j.error) throw new Error(j.error)
      setNombre(j.nombre)
    } catch (e) { setError((e as Error).message) } finally { setBuscando(false) }
  }

  async function agregar() {
    if (!nombre.trim()) return
    setGuardando(true); setError('')
    try {
      const cuitLimpio = cuit.replace(/\D/g, '')
      const r = await fetch('/api/monotributo/clientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, doc_tipo: cuitLimpio ? 80 : null, doc_nro: cuitLimpio || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setNombre(''); setCuit(''); await reload()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }

  async function importar() {
    setImportando(true); setError(''); setMsg('')
    try {
      const j = await fetch('/api/monotributo/clientes/importar', { method: 'POST' }).then(r => r.json())
      if (j.error) throw new Error(j.error)
      setMsg(j.importados > 0 ? `Importados ${j.importados} de tus facturas` : 'No había clientes nuevos para importar')
      await reload()
    } catch (e) { setError((e as Error).message) } finally { setImportando(false); setTimeout(() => setMsg(''), 5000) }
  }

  async function subirCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportando(true); setError(''); setMsg('')
    try {
      const csv = await file.text()
      const r = await fetch('/api/monotributo/importar-csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo importar')
      setMsg(`${j.importadas} facturas nuevas · ${j.enriquecidas} completadas · ${j.clientes} clientes actualizados`)
      await reload()
    } catch (err) { setError((err as Error).message) } finally { setImportando(false); setTimeout(() => setMsg(''), 8000) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-slate-800">Traé todo desde AFIP</p>
        <p className="text-xs text-slate-500">
          Bajá el CSV de <b>Mis Comprobantes → Emitidos</b> (descomprimí el .zip) y subilo: importamos tus facturas
          con el CUIT y el nombre del cliente, y completamos la libreta. Sirve también para las hechas en el facturador online.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-white px-3 py-2 rounded-lg cursor-pointer" style={{ background: 'var(--accent)' }}>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={subirCsv} disabled={importando} />
            {importando ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Subir CSV de Mis Comprobantes
          </label>
          <button onClick={importar} disabled={importando}
            className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
            <CloudDownload size={14} /> Solo nombres (de facturas ya cargadas)
          </button>
        </div>
      </div>
      {msg && <p className="text-xs text-emerald-600">{msg}</p>}

      {/* Agregar */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Agregar cliente</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <input value={cuit} onChange={e => setCuit(e.target.value.replace(/[^\d-]/g, ''))} placeholder="CUIT (opcional)" inputMode="numeric"
            className="w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          {afipConectado && (
            <button type="button" onClick={buscar} disabled={buscando || cuit.replace(/\D/g, '').length !== 11} title="Traer nombre de AFIP"
              className="px-3 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5 text-sm text-slate-600">
              {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre o razón social"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={agregar} disabled={guardando || !nombre.trim()}
            className="px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5" style={{ background: 'var(--accent)' }}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {clientes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Todavía no tenés clientes. Importalos de tus facturas o agregá uno.</p>
        ) : clientes.map(c => (
          <div key={c.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><User size={15} className="text-slate-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{c.nombre}</p>
                <p className="text-xs text-slate-400">{c.doc_nro ? `${docLabel(c.doc_tipo)} ${c.doc_nro}` : 'Sin CUIT'}</p>
              </div>
              {!c.doc_nro && editandoId !== c.id && (
                <button onClick={() => { setEditandoId(c.id); setEditCuit('') }}
                  className="text-xs text-[color:var(--accent)] hover:underline shrink-0">+ CUIT</button>
              )}
            </div>
            {editandoId === c.id && (
              <div className="flex gap-2 mt-2 ml-11">
                <input value={editCuit} onChange={e => setEditCuit(e.target.value.replace(/[^\d-]/g, ''))} placeholder="CUIT" inputMode="numeric" autoFocus
                  className="w-40 border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                <button onClick={() => guardarCuit(c)} disabled={editCuit.replace(/\D/g, '').length !== 11}
                  className="px-3 rounded-lg text-sm text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Guardar</button>
                <button onClick={() => { setEditandoId(null); setEditCuit('') }} className="px-3 rounded-lg text-sm text-slate-500 border border-slate-200">Cancelar</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">{clientes.length} cliente{clientes.length === 1 ? '' : 's'}</p>
    </div>
  )
}
