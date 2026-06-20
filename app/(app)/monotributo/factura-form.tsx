'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'

export type FacturaFormData = {
  id?:                string  // si viene, es edición
  fecha:              string
  cliente:            string
  concepto:           string | null
  monto:              number
  numero_comprobante: string | null
  tipo_comprobante:   string | null
  notas:              string | null
}

const TIPOS = ['C', 'A', 'B', 'E'] as const

export function FacturaForm({ initial }: { initial?: FacturaFormData }) {
  const router = useRouter()
  const isEdit = !!initial?.id
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    fecha:              initial?.fecha              ?? today,
    cliente:            initial?.cliente            ?? '',
    concepto:           initial?.concepto           ?? '',
    monto:              initial?.monto              ?? 0,
    numero_comprobante: initial?.numero_comprobante ?? '',
    tipo_comprobante:   initial?.tipo_comprobante   ?? 'C',
    notas:              initial?.notas              ?? '',
  })

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.cliente.trim()) { setError('Cliente es requerido'); return }
    if (form.monto <= 0)      { setError('Monto debe ser mayor a 0'); return }
    setSaving(true)

    const payload = {
      fecha:              form.fecha,
      cliente:            form.cliente.trim(),
      concepto:           form.concepto.trim() || null,
      monto:              Number(form.monto),
      numero_comprobante: form.numero_comprobante.trim() || null,
      tipo_comprobante:   form.tipo_comprobante,
      notas:              form.notas.trim() || null,
    }

    try {
      const url    = isEdit ? `/api/monotributo/facturas/${initial!.id}` : '/api/monotributo/facturas'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Error al guardar')
      }
      router.push('/monotributo')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

      {/* Fecha + Cliente */}
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
        <Field label="Fecha">
          <input
            type="date" required
            value={form.fecha}
            onChange={e => update('fecha', e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Cliente">
          <input
            type="text" required maxLength={200}
            value={form.cliente}
            onChange={e => update('cliente', e.target.value)}
            className={inputCls}
            placeholder="Ej: Sueldo SN, Cliente XYZ"
            autoFocus={!isEdit}
          />
        </Field>
      </div>

      {/* Monto + Tipo + Número */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr] gap-4">
        <Field label="Monto">
          <input
            type="number" step="0.01" min="0" required
            value={form.monto || ''}
            onChange={e => update('monto', parseFloat(e.target.value) || 0)}
            className={inputCls}
            placeholder="100000"
          />
        </Field>

        <Field label="Tipo">
          <select
            value={form.tipo_comprobante}
            onChange={e => update('tipo_comprobante', e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer`}
          >
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Número" hint="Opcional">
          <input
            type="text" maxLength={50}
            value={form.numero_comprobante}
            onChange={e => update('numero_comprobante', e.target.value)}
            className={inputCls}
            placeholder="00001-00000123"
          />
        </Field>
      </div>

      {/* Concepto */}
      <Field label="Concepto" hint="Opcional — qué facturaste">
        <input
          type="text" maxLength={500}
          value={form.concepto}
          onChange={e => update('concepto', e.target.value)}
          className={inputCls}
          placeholder="Ej: Desarrollo de software, Consultoría junio"
        />
      </Field>

      {/* Notas */}
      <Field label="Notas" hint="Opcional">
        <textarea
          value={form.notas}
          onChange={e => update('notas', e.target.value)}
          className={`${inputCls} min-h-[60px] resize-y`}
          maxLength={500}
        />
      </Field>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => router.push('/monotributo')}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          <Save size={14} />
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear factura'}
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-colors'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
