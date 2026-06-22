'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, Check, AlertTriangle, Loader2, FileText, Trash2 } from 'lucide-react'

// Datos que devuelve el parser (todos pueden venir null si la IA no los detectó)
type FacturaParseada = {
  fecha:              string | null
  cliente:            string | null
  cliente_cuit:       string | null
  monto:              number | null
  concepto:           string | null
  tipo_comprobante:   string | null
  punto_venta:        string | null
  numero_comprobante: string | null
  periodo_desde:      string | null
  periodo_hasta:      string | null
  cae:                string | null
  cae_vencimiento:    string | null
}

type ItemStatus = 'parsing' | 'ok' | 'duplicate' | 'error' | 'saving' | 'saved' | 'save_error'

type BatchItem = {
  id:       string
  fileName: string
  status:   ItemStatus
  data:     FacturaParseada | null
  include:  boolean
  error:    string | null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let _uid = 0
const nextId = () => `item_${_uid++}`

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })

export function ImportarFacturaButton() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [open, setOpen]       = useState(false)
  const [items, setItems]     = useState<BatchItem[]>([])
  const [phase, setPhase]     = useState<'parsing' | 'review' | 'saving' | 'done'>('parsing')
  const [topError, setTopError] = useState<string | null>(null)

  const patchItem = (id: string, patch: Partial<BatchItem>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))

  const patchData = (id: string, patch: Partial<FacturaParseada>) =>
    setItems(prev => prev.map(it => (it.id === id && it.data ? { ...it, data: { ...it.data, ...patch } } : it)))

  const reset = () => {
    setOpen(false); setItems([]); setPhase('parsing'); setTopError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Parseo de un PDF con retry en 429 ──
  const parseOne = async (base64: string, attempt = 0): Promise<{ duplicado: boolean; factura: FacturaParseada }> => {
    const res = await fetch('/api/monotributo/parsear-factura', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pdf: base64 }),
    })
    if (res.status === 429 && attempt < 3) {
      await sleep(4000)
      return parseOne(base64, attempt + 1)
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.message ?? data.error ?? 'No se pudo procesar el PDF')
    return { duplicado: data.duplicado, factura: data.factura }
  }

  // ── Pool con concurrencia limitada ──
  const handleFiles = async (files: File[]) => {
    setTopError(null)
    const pdfs = files.filter(f => f.type === 'application/pdf')
    if (pdfs.length === 0) { setTopError('Solo se aceptan archivos PDF'); return }

    const initial: BatchItem[] = pdfs.map(f => ({
      id: nextId(), fileName: f.name, status: 'parsing', data: null, include: true, error: null,
    }))
    setItems(initial)
    setPhase('parsing')
    setOpen(true)

    // Worker pool (concurrencia 3)
    let idx = 0
    const worker = async () => {
      while (idx < pdfs.length) {
        const i = idx++
        const item = initial[i]
        try {
          const base64 = await fileToBase64(pdfs[i])
          const { duplicado, factura } = await parseOne(base64)
          patchItem(item.id, {
            status:  duplicado ? 'duplicate' : 'ok',
            data:    factura,
            include: !duplicado,  // duplicados arrancan desmarcados
          })
        } catch (err) {
          patchItem(item.id, { status: 'error', include: false, error: err instanceof Error ? err.message : 'Error' })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, pdfs.length) }, worker))
    setPhase('review')
  }

  // ── Guardar las facturas seleccionadas ──
  const handleSaveAll = async () => {
    setPhase('saving'); setTopError(null)
    const toSave = items.filter(it => it.include && it.data && (it.status === 'ok' || it.status === 'duplicate'))

    for (const it of toSave) {
      const d = it.data!
      if (!d.cliente?.trim() || !d.monto || d.monto <= 0 || !d.fecha) {
        patchItem(it.id, { status: 'save_error', error: 'Faltan datos (cliente/monto/fecha)' })
        continue
      }
      patchItem(it.id, { status: 'saving' })
      try {
        const res = await fetch('/api/monotributo/facturas', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha: d.fecha, cliente: d.cliente.trim(), concepto: d.concepto?.trim() || null,
            monto: d.monto, tipo_comprobante: d.tipo_comprobante || 'C',
            numero_comprobante: d.numero_comprobante || null, punto_venta: d.punto_venta || null,
            cliente_cuit: d.cliente_cuit || null, periodo_desde: d.periodo_desde || null,
            periodo_hasta: d.periodo_hasta || null, cae: d.cae || null, cae_vencimiento: d.cae_vencimiento || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          patchItem(it.id, { status: 'save_error', error: res.status === 409 ? 'Duplicada (CAE ya existe)' : (data.error ?? 'Error al guardar') })
        } else {
          patchItem(it.id, { status: 'saved' })
        }
      } catch {
        patchItem(it.id, { status: 'save_error', error: 'Error de red' })
      }
    }
    setPhase('done')
    router.refresh()
  }

  const okItems        = items.filter(it => it.status === 'ok' || it.status === 'duplicate')
  const selectedCount  = items.filter(it => it.include && it.data && (it.status === 'ok' || it.status === 'duplicate')).length
  const savedCount     = items.filter(it => it.status === 'saved').length
  const parsingCount   = items.filter(it => it.status === 'parsing').length

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) handleFiles(fs) }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
      >
        <Upload size={14} />Importar PDFs
      </button>

      {topError && !open && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <AlertTriangle size={14} />{topError}
          <button onClick={() => setTopError(null)} className="ml-2"><X size={14} /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={phase !== 'saving' ? reset : undefined}>
          <div
            className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                <h2 className="text-base font-semibold text-slate-800">
                  {phase === 'parsing'  && `Leyendo ${items.length} ${items.length === 1 ? 'factura' : 'facturas'}…`}
                  {phase === 'review'   && `${okItems.length} de ${items.length} listas`}
                  {phase === 'saving'   && 'Guardando…'}
                  {phase === 'done'     && `${savedCount} guardadas`}
                </h2>
              </div>
              {phase !== 'saving' && (
                <button onClick={reset} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {phase === 'parsing' && parsingCount > 0 && (
                <p className="text-xs text-slate-400 px-2 pb-2">
                  Extrayendo datos con IA · {items.length - parsingCount}/{items.length}
                </p>
              )}

              {items.map(it => (
                <FacturaRow
                  key={it.id}
                  item={it}
                  editable={phase === 'review'}
                  onToggle={() => patchItem(it.id, { include: !it.include })}
                  onPatch={(p) => patchData(it.id, p)}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              {phase === 'review' && (
                <>
                  <span className="text-xs text-slate-400">{selectedCount} seleccionadas para guardar</span>
                  <div className="flex items-center gap-3">
                    <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button
                      onClick={handleSaveAll}
                      disabled={selectedCount === 0}
                      className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50"
                      style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
                    >
                      <Check size={14} />Guardar {selectedCount > 0 ? selectedCount : ''} {selectedCount === 1 ? 'factura' : 'facturas'}
                    </button>
                  </div>
                </>
              )}
              {phase === 'saving' && (
                <span className="text-sm text-slate-500 flex items-center gap-2 mx-auto">
                  <Loader2 size={14} className="animate-spin" />Guardando facturas…
                </span>
              )}
              {phase === 'parsing' && (
                <span className="text-sm text-slate-500 flex items-center gap-2 mx-auto">
                  <Loader2 size={14} className="animate-spin" />Procesando PDFs…
                </span>
              )}
              {phase === 'done' && (
                <button onClick={reset} className="text-sm text-white px-5 py-2.5 rounded-lg font-medium mx-auto"
                  style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
                  Listo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Fila de una factura en la lista ─────────────────────────────────────────
function FacturaRow({
  item, editable, onToggle, onPatch,
}: {
  item:     BatchItem
  editable: boolean
  onToggle: () => void
  onPatch:  (p: Partial<FacturaParseada>) => void
}) {
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Estado visual por status
  const badge = {
    parsing:    { label: 'Leyendo…',   cls: 'bg-slate-100 text-slate-500' },
    ok:         { label: 'Lista',      cls: 'bg-emerald-50 text-emerald-700' },
    duplicate:  { label: 'Duplicada',  cls: 'bg-amber-50 text-amber-700' },
    error:      { label: 'Error',      cls: 'bg-red-50 text-red-700' },
    saving:     { label: 'Guardando…', cls: 'bg-slate-100 text-slate-500' },
    saved:      { label: 'Guardada ✓', cls: 'bg-emerald-100 text-emerald-700' },
    save_error: { label: 'Falló',      cls: 'bg-red-50 text-red-700' },
  }[item.status]

  const d = item.data
  const isProblem = item.status === 'error' || item.status === 'save_error'

  return (
    <div className={`rounded-xl border p-3 ${isProblem ? 'border-red-200 bg-red-50/40' : item.status === 'duplicate' ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3">
        {/* Checkbox include (solo en review y si hay data) */}
        {editable && d && (item.status === 'ok' || item.status === 'duplicate') ? (
          <input type="checkbox" checked={item.include} onChange={onToggle}
            className="w-4 h-4 rounded accent-emerald-600 shrink-0" />
        ) : (
          <div className="w-4 shrink-0">
            {item.status === 'parsing' || item.status === 'saving'
              ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
          </div>
        )}

        {/* Datos */}
        <div className="flex-1 min-w-0">
          {d && (item.status !== 'error') ? (
            editable ? (
              <div className="grid grid-cols-[110px_1fr_120px] gap-2 items-center">
                <input type="date" value={d.fecha ?? ''} onChange={e => onPatch({ fecha: e.target.value })}
                  className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-400" />
                <input type="text" value={d.cliente ?? ''} onChange={e => onPatch({ cliente: e.target.value })}
                  placeholder="Cliente" className="text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-400 truncate" />
                <input type="number" step="0.01" value={d.monto ?? ''} onChange={e => onPatch({ monto: parseFloat(e.target.value) || null })}
                  placeholder="Monto" className="text-sm text-right border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-400 tabular-nums" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{d.cliente ?? item.fileName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{d.fecha ?? '—'}{d.concepto ? ` · ${d.concepto}` : ''}</p>
                </div>
                {d.monto != null && <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0">${fmt(d.monto)}</span>}
              </div>
            )
          ) : (
            <div className="min-w-0">
              <p className="text-sm text-slate-600 truncate">{item.fileName}</p>
              {item.error && <p className="text-[11px] text-red-500 truncate">{item.error}</p>}
            </div>
          )}
        </div>

        {/* Badge */}
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>{badge.label}</span>
      </div>
    </div>
  )
}
