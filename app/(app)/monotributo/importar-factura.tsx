'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X, Check, AlertTriangle, Loader2 } from 'lucide-react'

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

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ImportarFacturaButton() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [parsed, setParsed]     = useState<FacturaParseada | null>(null)
  const [duplicado, setDuplicado] = useState(false)

  // Campos editables del preview (el user puede corregir antes de guardar)
  const [form, setForm] = useState<FacturaParseada | null>(null)

  const reset = () => {
    setParsed(null); setForm(null); setError(null); setDuplicado(false)
    setLoading(false); setSaving(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Solo se aceptan archivos PDF'); return }
    setError(null)
    setLoading(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1]
        const res = await fetch('/api/monotributo/parsear-factura', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pdf: base64 }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error === 'rate_limit' ? data.message : (data.message ?? data.error ?? 'No se pudo procesar el PDF'))
        setParsed(data.factura)
        setForm(data.factura)
        setDuplicado(data.duplicado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al procesar el PDF')
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => { setError('No se pudo leer el archivo'); setLoading(false) }
    reader.readAsDataURL(file)
  }

  const update = <K extends keyof FacturaParseada>(k: K, v: FacturaParseada[K]) =>
    setForm(p => (p ? { ...p, [k]: v } : p))

  const handleConfirm = async () => {
    if (!form) return
    if (!form.cliente?.trim()) { setError('Falta el cliente'); return }
    if (!form.monto || form.monto <= 0) { setError('Falta el monto'); return }
    if (!form.fecha) { setError('Falta la fecha'); return }

    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/monotributo/facturas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha:              form.fecha,
          cliente:            form.cliente.trim(),
          concepto:           form.concepto?.trim() || null,
          monto:              form.monto,
          tipo_comprobante:   form.tipo_comprobante || 'C',
          numero_comprobante: form.numero_comprobante || null,
          punto_venta:        form.punto_venta || null,
          cliente_cuit:       form.cliente_cuit || null,
          periodo_desde:      form.periodo_desde || null,
          periodo_hasta:      form.periodo_hasta || null,
          cae:                form.cae || null,
          cae_vencimiento:    form.cae_vencimiento || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) throw new Error(data.message ?? 'Ya cargaste esta factura.')
        throw new Error(data.error ?? 'No se pudo guardar la factura')
      }
      reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="inline-flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {loading ? 'Leyendo…' : 'Importar PDF'}
      </button>

      {/* Error fuera del modal (ej. error de parseo) */}
      {error && !form && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError(null)} className="ml-2"><X size={14} /></button>
        </div>
      )}

      {/* Modal de preview/confirmación */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={reset}>
          <div
            className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                <h2 className="text-base font-semibold text-slate-800">Revisá los datos</h2>
              </div>
              <button onClick={reset} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Extraído del PDF con IA. Revisá y corregí lo que haga falta antes de guardar.
              </p>

              {duplicado && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>Ya tenés una factura cargada con este CAE. Si la guardás de nuevo te va a dar error.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha">
                  <input type="date" value={form.fecha ?? ''} onChange={e => update('fecha', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Tipo">
                  <input type="text" value={form.tipo_comprobante ?? ''} onChange={e => update('tipo_comprobante', e.target.value)} className={inputCls} maxLength={4} />
                </Field>
              </div>

              <Field label="Cliente">
                <input type="text" value={form.cliente ?? ''} onChange={e => update('cliente', e.target.value)} className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="CUIT cliente">
                  <input type="text" value={form.cliente_cuit ?? ''} onChange={e => update('cliente_cuit', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Monto">
                  <input type="number" step="0.01" value={form.monto ?? ''} onChange={e => update('monto', parseFloat(e.target.value) || null)} className={inputCls} />
                </Field>
              </div>

              <Field label="Concepto">
                <input type="text" value={form.concepto ?? ''} onChange={e => update('concepto', e.target.value)} className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Período desde">
                  <input type="date" value={form.periodo_desde ?? ''} onChange={e => update('periodo_desde', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Período hasta">
                  <input type="date" value={form.periodo_hasta ?? ''} onChange={e => update('periodo_hasta', e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="N° comprobante">
                  <input type="text" value={form.numero_comprobante ?? ''} onChange={e => update('numero_comprobante', e.target.value)} className={inputCls} />
                </Field>
                <Field label="CAE">
                  <input type="text" value={form.cae ?? ''} onChange={e => update('cae', e.target.value)} className={inputCls} />
                </Field>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between sticky bottom-0 bg-white">
              <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50"
                style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando…' : 'Guardar factura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const inputCls = 'w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
