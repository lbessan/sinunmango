'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'

type Config = {
  categoria:                string
  actividad:                string
  limite_facturacion_anual: number
  costo_mensual:            number
  vigente_desde:            string
  gasto_fijo_id:            string | null
  notas:                    string | null
} | null

type GastoFijo = {
  id:              string
  nombre_gasto:    string
  dia_vencimiento: number | null
}

const CATEGORIAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

export function MonotributoConfigForm({
  initialConfig, gastosFijos,
}: {
  initialConfig: Config
  gastosFijos:   GastoFijo[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    categoria:                initialConfig?.categoria                ?? 'A',
    actividad:                initialConfig?.actividad                ?? 'servicios',
    limite_facturacion_anual: initialConfig?.limite_facturacion_anual ?? 0,
    costo_mensual:            initialConfig?.costo_mensual            ?? 0,
    vigente_desde:            initialConfig?.vigente_desde            ?? today,
    gasto_fijo_id:            initialConfig?.gasto_fijo_id            ?? '',
    notas:                    initialConfig?.notas                    ?? '',
  })

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await fetch('/api/monotributo/config', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria:                form.categoria,
          actividad:                form.actividad,
          limite_facturacion_anual: Number(form.limite_facturacion_anual),
          costo_mensual:            Number(form.costo_mensual),
          vigente_desde:            form.vigente_desde,
          gasto_fijo_id:            form.gasto_fijo_id || null,
          notas:                    form.notas || null,
        }),
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

      {/* Categoría + Actividad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Categoría">
          <select
            value={form.categoria}
            onChange={e => update('categoria', e.target.value)}
            className={selectCls}
          >
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Actividad">
          <select
            value={form.actividad}
            onChange={e => update('actividad', e.target.value)}
            className={selectCls}
          >
            <option value="servicios">Servicios</option>
            <option value="venta_bienes">Venta de bienes</option>
          </select>
        </Field>
      </div>

      {/* Límite anual + Costo mensual */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Límite facturación anual" hint="ARS — total de los 12 meses móviles">
          <input
            type="number" step="0.01" min="0" required
            value={form.limite_facturacion_anual || ''}
            onChange={e => update('limite_facturacion_anual', parseFloat(e.target.value) || 0)}
            className={inputCls}
            placeholder="82370281.42"
          />
        </Field>

        <Field label="Costo mensual" hint="Impuesto integrado + jubilación + obra social">
          <input
            type="number" step="0.01" min="0" required
            value={form.costo_mensual || ''}
            onChange={e => update('costo_mensual', parseFloat(e.target.value) || 0)}
            className={inputCls}
            placeholder="35000"
          />
        </Field>
      </div>

      {/* Vigente desde + Gasto fijo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Vigente desde" hint="Cuándo entraste a esta categoría">
          <input
            type="date" required
            value={form.vigente_desde}
            onChange={e => update('vigente_desde', e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Gasto fijo asociado" hint="Opcional — para ver el próximo vencimiento">
          <select
            value={form.gasto_fijo_id}
            onChange={e => update('gasto_fijo_id', e.target.value)}
            className={selectCls}
          >
            <option value="">— Ninguno —</option>
            {gastosFijos.map(gf => (
              <option key={gf.id} value={gf.id}>
                {gf.nombre_gasto}{gf.dia_vencimiento ? ` (día ${gf.dia_vencimiento})` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Notas */}
      <Field label="Notas" hint="Opcional — recordatorios para vos">
        <textarea
          value={form.notas}
          onChange={e => update('notas', e.target.value)}
          className={`${inputCls} min-h-[70px] resize-y`}
          placeholder="Ej: recategorización julio 2026"
          maxLength={500}
        />
      </Field>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
        >
          <Save size={14} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

const inputCls  = 'w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-colors'
const selectCls = `${inputCls} appearance-none cursor-pointer`

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
